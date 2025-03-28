require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const Timer = require('./utils/timing');
const mysql = require('mysql2/promise');
const config = require('./utils/config');
const { generateISBN, randomNumber } = require('./utils/books-authors-generator');

// Update config for new database
config.mysql.database = process.env.MYSQL_DATABASE || 'LibrosAutores';
config.mongo.database = process.env.MYSQL_DATABASE || 'LibrosAutores';
config.mongo.collection = 'MassBooks';

const timer = new Timer();
const csvOutputPath = path.join(config.paths.tmpDir, 'old_books.csv');

// Check for reduced data flag
const useReducedData = process.argv.includes('--reduced-data');
const RECORD_COUNT = useReducedData ? 100000 : 1000000;

async function run() {
  timer.start('total');

  try {
    // Step 1: Generate and insert records in MongoDB
    console.log(`🔵 Step 1: Generating ${RECORD_COUNT} book records in MongoDB...`);
    await generateMillionRecords();
    
    // Step 2: Export only ISBN, year, pages fields to CSV
    console.log("\n🔵 Step 2: Exporting ISBN, year, pages fields to CSV...");
    await exportFieldsToCSV();
    
    // Step 3: Create old_books table in MySQL and import the data
    console.log("\n🔵 Step 3: Creating old_books table in MySQL and importing data...");
    await importToMySQLOldBooks();
    
    console.log("\n✅ All steps completed successfully!");
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    timer.end('total');
    console.log("\n📊 Performance Metrics:");
    console.log(JSON.stringify(timer.getMetrics(), null, 2));
  }
}

async function generateMillionRecords() {
  timer.start('generate_million_mongodb');
  
  try {
    // Check if we can connect to MongoDB first
    console.log("Testing MongoDB connection...");
    const client = new MongoClient(config.mongo.uri, {
      ...config.mongo.options,
      serverSelectionTimeoutMS: 5000 // Shorter timeout for initial connection test
    });
    
    try {
      await client.connect();
      console.log("MongoDB connection successful");
      
      const db = client.db(config.mongo.database);
      const collection = db.collection(config.mongo.collection);
      
      // Drop collection if it exists
      try {
        await collection.drop();
        console.log("Collection dropped");
      } catch (err) {
        // Ignore if collection doesn't exist
        console.log("Collection didn't exist or couldn't be dropped");
      }
      
      const batchSize = 5000;
      const totalRecords = RECORD_COUNT;
      let inserted = 0;
      
      console.log(`Generating and inserting ${totalRecords} records in batches of ${batchSize}...`);
      
      while (inserted < totalRecords) {
        const batch = [];
        const currentBatchSize = Math.min(batchSize, totalRecords - inserted);
        
        // Generate batch of books
        for (let i = 0; i < currentBatchSize; i++) {
          batch.push({
            ISBN: generateISBN(),
            year: randomNumber(1900, 2023),
            pages: randomNumber(50, 1500)
          });
        }
        
        // Insert batch
        await collection.insertMany(batch);
        inserted += currentBatchSize;
        
        // Log progress
        console.log(`Inserted ${inserted} of ${totalRecords} records`);
      }
      
      console.log(`Successfully generated and inserted ${totalRecords} book records`);
      
    } catch (error) {
      console.error("MongoDB connection test failed:", error);
      console.log(`
      Please run 'node setup-credentials.js' to configure your MongoDB connection
      or try setting the connection URL directly:
      
      For MongoDB without auth:    mongodb://localhost:27018/LibrosAutores
      For MongoDB with auth:       mongodb://username:password@localhost:27018/LibrosAutores
      `);
      throw new Error("MongoDB connection failed");
    } finally {
      await client.close();
    }
    
  } catch (error) {
    console.error("Error generating million records:", error);
  } finally {
    timer.end('generate_million_mongodb');
  }
}

async function exportFieldsToCSV() {
  timer.start('export_to_csv');
  
  try {
    const client = new MongoClient(config.mongo.uri, config.mongo.options);
    await client.connect();
    
    const db = client.db(config.mongo.database);
    const collection = db.collection(config.mongo.collection);
    
    // Get all records but only the fields we need
    const cursor = collection.find({}, { projection: { _id: 0, ISBN: 1, year: 1, pages: 1 } });
    
    // Write header
    let csvContent = 'ISBN,year,pages\n';
    
    // Write data in batches
    const batchSize = 10000;
    let count = 0;
    let batch = [];
    
    console.log("Exporting data to CSV...");
    
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      batch.push(`"${doc.ISBN}",${doc.year},${doc.pages}`);
      
      if (batch.length >= batchSize) {
        // Write batch to file
        fs.appendFileSync(csvOutputPath, batch.join('\n') + '\n');
        count += batch.length;
        console.log(`Exported ${count} records to CSV`);
        batch = [];
      }
    }
    
    // Write any remaining records
    if (batch.length > 0) {
      fs.writeFileSync(csvOutputPath, csvContent + batch.join('\n') + '\n');
      count += batch.length;
    } else {
      fs.writeFileSync(csvOutputPath, csvContent);
    }
    
    console.log(`Total ${count} records exported to ${csvOutputPath}`);
    
  } catch (error) {
    console.error("Error exporting to CSV:", error);
    console.error("TIP: Run 'node setup-credentials.js' to configure your database connections");
  } finally {
    timer.end('export_to_csv');
  }
}

async function importToMySQLOldBooks() {
  timer.start('import_to_mysql');
  
  try {
    // Connect to MySQL
    const connection = await mysql.createConnection({
      host: config.mysql.host,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database
    });
    
    // Create old_books table
    await connection.query(`
      DROP TABLE IF EXISTS old_books
    `);
    
    await connection.query(`
      CREATE TABLE old_books (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ISBN VARCHAR(16) NOT NULL,
        year SMALLINT NOT NULL,
        pages SMALLINT
      )
    `);
    
    console.log("Created old_books table");
    
    // Determine if we need to copy to secure file path
    let finalCsvPath = csvOutputPath;
    let usedSecureDir = false;
    
    try {
      // Try using LOAD DATA INFILE directly first
      await connection.query(`
        LOAD DATA INFILE ?
        INTO TABLE old_books
        FIELDS TERMINATED BY ',' ENCLOSED BY '"'
        LINES TERMINATED BY '\n'
        IGNORE 1 ROWS
        (ISBN, year, pages)
      `, [csvOutputPath]);
    } catch (err) {
      if (err.code === 'ER_OPTION_PREVENTS_STATEMENT') {
        // If secure_file_priv restriction prevents direct loading, use our helper
        console.log("Direct file access restricted, using secure directory...");
        const fileHelper = require('./utils/file-helper');
        finalCsvPath = fileHelper.copyToSecureFileDir(csvOutputPath);
        usedSecureDir = true;
        
        // Try again with the new file location
        await connection.query(`
          LOAD DATA INFILE ?
          INTO TABLE old_books
          FIELDS TERMINATED BY ',' ENCLOSED BY '"'
          LINES TERMINATED BY '\n'
          IGNORE 1 ROWS
          (ISBN, year, pages)
        `, [finalCsvPath]);
      } else {
        // If it's some other error, fallback to manual batch inserts
        console.log("LOAD DATA INFILE failed, using batch inserts instead...");
        await insertCSVUsingBatch(csvOutputPath, connection);
      }
    }
    
    // Clean up the secure directory file if we created one
    if (usedSecureDir) {
      const fileHelper = require('./utils/file-helper');
      fileHelper.deleteFromSecureFileDir(path.basename(csvOutputPath));
    }
    
    // Get count of imported rows
    const [rows] = await connection.query(`SELECT COUNT(*) as count FROM old_books`);
    console.log(`Imported ${rows[0].count} records into old_books table`);
    
    await connection.end();
    
  } catch (error) {
    console.error("Error importing to MySQL:", error);
  } finally {
    timer.end('import_to_mysql');
  }
}

// Helper function to insert CSV using batch inserts as a fallback
async function insertCSVUsingBatch(csvPath, existingConnection) {
  const connection = existingConnection;
  
  // Read and parse CSV file
  const fileContent = fs.readFileSync(csvPath, 'utf8');
  const rows = fileContent.split('\n');
  
  // Skip header row
  const dataRows = rows.slice(1).filter(row => row.trim());
  
  // Use batch inserts for better performance
  const batchSize = 1000;
  let insertedCount = 0;
  
  for (let i = 0; i < dataRows.length; i += batchSize) {
    const batch = dataRows.slice(i, i + batchSize);
    const values = [];
    const placeholders = [];
    
    batch.forEach(row => {
      try {
        // Parse CSV row (simple version assuming well-formed data)
        const parts = row.split(',');
        const isbn = parts[0].replace(/"/g, '');
        const year = parseInt(parts[1]);
        const pages = parseInt(parts[2]);
        
        values.push(isbn, year, pages);
        placeholders.push('(?, ?, ?)');
      } catch (err) {
        console.error(`Error parsing row: ${row}`, err);
      }
    });
    
    if (placeholders.length > 0) {
      // Build query
      const query = `INSERT INTO old_books (ISBN, year, pages) VALUES ${placeholders.join(',')}`;
      await connection.query(query, values);
      insertedCount += placeholders.length;
    }
    
    // Log progress
    if ((i + batchSize) >= dataRows.length || i % (batchSize * 5) === 0) {
      console.log(`Imported ${insertedCount} of ${dataRows.length} rows...`);
    }
  }
  
  return insertedCount;
}

// Run the script
run();
