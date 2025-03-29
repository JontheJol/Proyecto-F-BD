require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const Timer = require('./utils/timing');
const config = require('./utils/config');
const { generateAuthors, authorsToCSV } = require('./utils/books-authors-generator');

const timer = new Timer();
const tmpDir = config.paths.tmpDir;
const largeAuthorCSV = path.join(tmpDir, 'debug_authors.csv');
const licenseSet = new Set(); // To track licenses for duplicates

// Configuration
const CHUNK_SIZE = 1000;
const TOTAL_AUTHORS = 5000; // Start with a smaller number for debugging
const CHUNKS = Math.ceil(TOTAL_AUTHORS / CHUNK_SIZE);

async function getConnection() {
  return await mysql.createConnection({
    host: config.mysql.host,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    multipleStatements: true
  });
}

async function debugGenerateAuthors() {
  timer.start('generate_authors');
  
  try {
    console.log("Creating CSV header...");
    fs.writeFileSync(largeAuthorCSV, 'id,license,name,lastName,secondLastName,year\n');
    
    let totalGenerated = 0;
    let licenseCollisions = 0;
    
    // Generate authors in smaller chunks to catch any issues
    for (let i = 0; i < CHUNKS; i++) {
      const currentCount = Math.min(CHUNK_SIZE, TOTAL_AUTHORS - totalGenerated);
      console.log(`Generating chunk ${i+1}/${CHUNKS} (${currentCount} authors)`);
      
      const startId = 51 + totalGenerated; // Start ID after initial authors
      const authors = generateAuthors(currentCount, startId);
      
      // Check for duplicate licenses
      authors.forEach(author => {
        if (licenseSet.has(author.license)) {
          licenseCollisions++;
          console.log(`⚠️ Duplicate license found: ${author.license}`);
        } else {
          licenseSet.add(author.license);
        }
      });
      
      const authorsCSV = authorsToCSV(authors).split('\n').slice(1).join('\n');
      fs.appendFileSync(largeAuthorCSV, authorsCSV + '\n');
      totalGenerated += currentCount;
    }
    
    console.log(`✅ Generated ${totalGenerated} authors with ${licenseCollisions} license collisions`);
    if (licenseCollisions > 0) {
      console.log('⚠️ Duplicate licenses will cause SQL errors due to UNIQUE constraint!');
    }
    
    return { totalGenerated, licenseCollisions };
  } catch (error) {
    console.error("❌ Error generating authors:", error);
    throw error;
  } finally {
    timer.end('generate_authors');
  }
}

async function debugInsertAuthors() {
  timer.start('insert_authors');
  
  try {
    console.log("Starting CSV insertion...");
    
    // Use our batch insert function
    const mysqlOps = require('./utils/mysql-operations');
    const fieldNames = ['id', 'license', 'name', 'lastName', 'secondLastName', 'year'];
    
    // Transform function with detailed error handling
    const transform = (rowData, headers) => {
      try {
        const values = [];
        const placeholders = [];
        
        fieldNames.forEach((field, idx) => {
          const value = rowData[idx];
          if ((field === 'secondLastName' || field === 'year') && (!value || value === '""' || value === '')) {
            values.push(null);
          } else {
            values.push(value);
          }
          placeholders.push('?');
        });
        
        return { values, placeholders: placeholders.join(',') };
      } catch (err) {
        console.error(`Error in transform function:`, err);
        console.error(`Problem row data:`, rowData);
        return null;
      }
    };
    
    console.log("Reading and parsing CSV file...");
    const fileContent = fs.readFileSync(largeAuthorCSV, 'utf8');
    const lines = fileContent.split('\n');
    
    console.log(`CSV file has ${lines.length} lines (including header)`);
    console.log(`First line (header): ${lines[0]}`);
    console.log(`Second line (example): ${lines[1] || 'N/A'}`);
    
    // Try a direct small insertion first
    console.log("Attempting a direct insertion of first 5 rows...");
    const connection = await getConnection();
    try {
      const sample = lines.slice(1, 6).filter(line => line.trim());
      for (const line of sample) {
        try {
          const rowData = mysqlOps.parseCSVRow(line);
          const transformed = transform(rowData, lines[0].split(','));
          
          if (transformed) {
            const query = `INSERT INTO Autor (${fieldNames.join(',')}) VALUES (${transformed.placeholders})`;
            await connection.query(query, transformed.values);
            console.log(`Successfully inserted: ${line}`);
          }
        } catch (err) {
          console.error(`Error with line: ${line}`);
          console.error(err);
        }
      }
    } finally {
      await connection.end();
    }
    
    // Now try the batch insertion
    console.log("Now attempting batch insertion...");
    const inserted = await mysqlOps.batchInsertFromCSV(largeAuthorCSV, 'Autor', fieldNames, transform);
    console.log(`Total authors inserted: ${inserted}`);
    
    return inserted;
  } catch (error) {
    console.error("❌ Error inserting authors:", error);
    throw error;
  } finally {
    timer.end('insert_authors');
  }
}

async function main() {
  console.log('🔍 Debugging Test 7: Generate and Insert Authors');
  timer.start('total');
  
  try {
    await debugGenerateAuthors();
    await debugInsertAuthors();
  } catch (error) {
    console.error('Unhandled error:', error);
  } finally {
    timer.end('total');
    console.log('\n📊 Performance metrics:');
    console.log(JSON.stringify(timer.getMetrics(), null, 2));
  }
}

main();
