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

async function run() {
  timer.start('total');

  try {
    // Step 1: Generate and insert 1,000,000 books in MongoDB
    console.log("🔵 Step 1: Generating 1,000,000 book records in MongoDB...");
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
    const client = new MongoClient(config.mongo.uri);
    await client.connect();
    
    const db = client.db(config.mongo.database);
    const collection = db.collection(config.mongo.collection);
    
    // Drop collection if it exists
    try {
      await collection.drop();
      console.log("Collection dropped");
    } catch (err) {
      // Ignore if collection doesn't exist
    }
    
    const batchSize = 10000;
    const totalRecords = 1000000;
    let inserted = 0;
    
    console.log("Generating and inserting records in batches...");
    
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
    console.error("Error generating million records:", error);
  } finally {
    timer.end('generate_million_mongodb');
  }
}

async function exportFieldsToCSV() {
  timer.start('export_to_csv');
  
  try {
    const client = new MongoClient(config.mongo.uri);
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
    
    // Import from CSV
    await connection.query(`
      LOAD DATA INFILE ?
      INTO TABLE old_books
      FIELDS TERMINATED BY ',' ENCLOSED BY '"'
      LINES TERMINATED BY '\n'
      IGNORE 1 ROWS
      (ISBN, year, pages)
    `, [csvOutputPath]);
    
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

// Run the script
run();
