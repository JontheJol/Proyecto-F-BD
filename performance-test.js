require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const Timer = require('./utils/timing');
const { MongoClient } = require('mongodb');
const Process = require('./utils/Process');
const config = require('./utils/config');
const { 
  generateAuthors, 
  generateBooks, 
  authorsToCSV, 
  booksToCSV, 
  saveToCSV,
  generateMultipleCSV
} = require('./utils/books-authors-generator');

// Update config for new database
config.mysql.database = process.env.MYSQL_DATABASE || 'LibrosAutores';
config.mongo.database = process.env.MYSQL_DATABASE || 'LibrosAutores';
config.mongo.collection = 'Libros';

const timer = new Timer();
const tmpDir = config.paths.tmpDir;
const largeBookCSV = path.join(tmpDir, 'large_books.csv');
const largeAuthorCSV = path.join(tmpDir, 'large_authors.csv');
const exportedBooksCSV = path.join(tmpDir, 'exported_books.csv');
const exportedAuthorsCSV = path.join(tmpDir, 'exported_authors.csv');
const allAuthorLicenses = [];

async function getConnection(user = config.mysql.user, password = config.mysql.password) {
  return await mysql.createConnection({
    host: config.mysql.host,
    user,
    password,
    database: config.mysql.database,
    multipleStatements: true
  });
}

async function runTests() {
  timer.start('total_performance_test');
  console.log("Starting performance tests...");
  
  try {
    // First, we need to add some authors for foreign key references
    await createInitialAuthors();
    
    // Test 1: Create 100,000 books in CSV
    console.log("\n📊 TEST 1: Generate 100,000 books CSV");
    timer.start('generate_large_books_csv');
    const books = generateBooks(100000, allAuthorLicenses);
    const booksCSV = booksToCSV(books);
    fs.writeFileSync(largeBookCSV, booksCSV);
    timer.end('generate_large_books_csv');
    
    // Test 2: Insert the CSV into MySQL
    console.log("\n📊 TEST 2: Insert books CSV into MySQL");
    await insertBooksCSVIntoMySQL(largeBookCSV);
    
    // Test 3: Insert 3,500 books to stress test MySQL
    console.log("\n📊 TEST 3: Stress test with 3,500 books");
    await stressTestMySQL();
    
    // Test 4: Generate 100 CSV files with 1000 books each
    console.log("\n📊 TEST 4: Generate 100 CSV files (1000 books each)");
    timer.start('generate_multiple_csv');
    const csvFiles = generateMultipleCSV(100, 1000, 
      (count) => generateBooks(count, allAuthorLicenses), 
      booksToCSV, 
      'books_batch');
    timer.end('generate_multiple_csv');
    
    // Test 5: Insert all 100 CSV files
    console.log("\n📊 TEST 5: Insert 100 CSV files into MySQL");
    await insertMultipleCSVFiles(csvFiles);
    
    // Test 6: Complex query for statistics
    console.log("\n📊 TEST 6: Run complex statistics query");
    await runComplexQuery();
    
    // Test 7: Generate and insert 150,000 authors
    console.log("\n📊 TEST 7: Generate and insert 150,000 authors");
    await generateAndInsertAuthors();
    
    // Test 8: Export tables to CSV
    console.log("\n📊 TEST 8: Export tables to CSV");
    await exportTablesToCSV();
    
    // Test 9: Backup to MongoDB, delete from MySQL, export from MongoDB, restore to MySQL
    console.log("\n📊 TEST 9: MySQL to MongoDB migration and restoration");
    await migrateAndRestore();
    
    // Test 10: MySQL dump
    console.log("\n📊 TEST 10: MySQL database dump");
    await mysqlDump();
    
    // Test 11: MySQL restore from dump
    console.log("\n📊 TEST 11: MySQL database restore");
    await mysqlRestore();
    
    // Test 12: Failed inserts with unauthorized users
    console.log("\n📊 TEST 12: Permission failure tests");
    await testPermissionFailures();
    
  } catch (error) {
    console.error("Error running performance tests:", error);
  } finally {
    timer.end('total_performance_test');
    console.log("\n📈 Performance Test Results");
    console.log(JSON.stringify(timer.getMetrics(), null, 2));
    
    // Generate report
    generatePerformanceReport(timer.getMetrics());
  }
}

async function createInitialAuthors() {
  timer.start('create_initial_authors');
  const connection = await getConnection();
  
  try {
    // Generate a small set of authors first
    const authors = generateAuthors(50);
    
    // Store all licenses for later use when generating books
    authors.forEach(author => allAuthorLicenses.push(author.license));
    
    // Insert authors
    for (const author of authors) {
      await connection.execute(
        `INSERT INTO Autor (license, name, lastName, secondLastName, year) 
         VALUES (?, ?, ?, ?, ?)`,
        [author.license, author.name, author.lastName, author.secondLastName, author.year]
      );
    }
    
    console.log(`Created ${authors.length} initial authors`);
  } catch (error) {
    console.error("Error creating initial authors:", error);
  } finally {
    await connection.end();
    timer.end('create_initial_authors');
  }
}

async function insertBooksCSVIntoMySQL(csvFilePath) {
  timer.start('insert_large_books_csv');
  const connection = await getConnection();
  
  try {
    // Create temporary table without foreign key constraints
    await connection.query(`
      CREATE TEMPORARY TABLE temp_libro (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ISBN VARCHAR(16) NOT NULL,
        title VARCHAR(512) NOT NULL,
        autor_license VARCHAR(12),
        editorial TINYTEXT,
        pages SMALLINT,
        year SMALLINT NOT NULL,
        genre TINYTEXT,
        language TINYTEXT NOT NULL,
        format TINYTEXT,
        sinopsis TEXT,
        content TEXT
      )
    `);
    
    // Load data from CSV
    await connection.query(`
      LOAD DATA INFILE ?
      INTO TABLE temp_libro
      FIELDS TERMINATED BY ',' ENCLOSED BY '"'
      LINES TERMINATED BY '\n'
      IGNORE 1 ROWS
      (id, ISBN, title, @autor_license, editorial, pages, year, genre, language, format, sinopsis, content)
      SET autor_license = NULLIF(@autor_license, '')
    `, [csvFilePath]);
    
    // Insert from temp table to real table with validation
    await connection.query(`
      INSERT INTO Libro (ISBN, title, autor_license, editorial, pages, year, genre, language, format, sinopsis, content)
      SELECT ISBN, title, autor_license, editorial, pages, year, genre, language, format, sinopsis, content
      FROM temp_libro
      WHERE autor_license IS NULL OR autor_license IN (SELECT license FROM Autor)
    `);
    
    // Drop temp table
    await connection.query(`DROP TEMPORARY TABLE temp_libro`);
    
    // Get count of inserted rows
    const [rows] = await connection.query(`SELECT COUNT(*) as count FROM Libro`);
    console.log(`Inserted ${rows[0].count} books from CSV`);
    
  } catch (error) {
    console.error("Error inserting books from CSV:", error);
  } finally {
    await connection.end();
    timer.end('insert_large_books_csv');
  }
}

async function stressTestMySQL() {
  timer.start('stress_test_mysql');
  const connection = await getConnection();
  
  try {
    // Generate 3,500 books for stress testing
    const stressBooks = generateBooks(3500, allAuthorLicenses);
    
    // Use transaction for faster insertion
    await connection.beginTransaction();
    
    // Insert books in batches of 100
    const batchSize = 100;
    for (let i = 0; i < stressBooks.length; i += batchSize) {
      const batch = stressBooks.slice(i, i + batchSize);
      
      // Convert batch to values string for bulk insert
      const values = batch.map(book => 
        `("${book.isbn}", "${book.title}", ${book.autor_license ? `"${book.autor_license}"` : 'NULL'}, 
          "${book.editorial}", ${book.pages}, ${book.year}, "${book.genre}", 
          "${book.language}", "${book.format}", "${book.sinopsis?.replace(/"/g, '\\"')}", 
          "${book.content?.replace(/"/g, '\\"')}")`
      ).join(',');
      
      // Execute bulk insert
      await connection.query(`
        INSERT INTO Libro 
          (ISBN, title, autor_license, editorial, pages, year, genre, language, format, sinopsis, content)
        VALUES ${values}
      `);
      
      // Log progress every 1000 books
      if ((i + batchSize) % 1000 === 0 || i + batchSize >= stressBooks.length) {
        console.log(`Inserted ${Math.min(i + batchSize, stressBooks.length)} of ${stressBooks.length} stress test books`);
      }
    }
    
    await connection.commit();
    
  } catch (error) {
    console.error("Error in stress test:", error);
    await connection.rollback();
  } finally {
    await connection.end();
    timer.end('stress_test_mysql');
  }
}

async function insertMultipleCSVFiles(csvFiles) {
  timer.start('insert_multiple_csv');
  
  try {
    // Process each CSV file
    for (let i = 0; i < csvFiles.length; i++) {
      const csvFile = csvFiles[i];
      
      // Insert this CSV
      const connection = await getConnection();
      try {
        // Use LOAD DATA INFILE for each CSV
        await connection.query(`
          LOAD DATA INFILE ?
          INTO TABLE Libro
          FIELDS TERMINATED BY ',' ENCLOSED BY '"'
          LINES TERMINATED BY '\n'
          IGNORE 1 ROWS
          (id, ISBN, title, @autor_license, editorial, pages, year, genre, language, format, sinopsis, content)
          SET autor_license = NULLIF(@autor_license, '')
        `, [csvFile]);
        
        // Log progress
        if ((i + 1) % 10 === 0 || i === csvFiles.length - 1) {
          console.log(`Processed ${i + 1} of ${csvFiles.length} CSV files`);
        }
      } finally {
        await connection.end();
      }
    }
    
  } catch (error) {
    console.error("Error inserting multiple CSV files:", error);
  } finally {
    timer.end('insert_multiple_csv');
  }
}

async function runComplexQuery() {
  timer.start('complex_query');
  const connection = await getConnection();
  
  try {
    // Run complex query with statistics
    const [results] = await connection.query(`
      SELECT 
        MAX(pages) as max_pages,
        MIN(pages) as min_pages,
        AVG(pages) as avg_pages,
        MAX(year) as newest_year,
        MIN(year) as oldest_year,
        COUNT(*) as total_books
      FROM Libro
    `);
    
    console.log("Query Results:", results[0]);
    
  } catch (error) {
    console.error("Error running complex query:", error);
  } finally {
    await connection.end();
    timer.end('complex_query');
  }
}

async function generateAndInsertAuthors() {
  timer.start('generate_insert_authors');
  
  try {
    // Generate 150,000 authors
    timer.start('generate_authors');
    const authors = generateAuthors(150000, 51); // Start ID after initial authors
    const authorsCSV = authorsToCSV(authors);
    fs.writeFileSync(largeAuthorCSV, authorsCSV);
    timer.end('generate_authors');
    
    // Insert authors using LOAD DATA INFILE
    timer.start('insert_authors');
    const connection = await getConnection();
    
    try {
      await connection.query(`
        LOAD DATA INFILE ?
        INTO TABLE Autor
        FIELDS TERMINATED BY ',' ENCLOSED BY '"'
        LINES TERMINATED BY '\n'
        IGNORE 1 ROWS
        (id, license, name, lastName, @secondLastName, @year)
        SET 
          secondLastName = NULLIF(@secondLastName, ''),
          year = NULLIF(@year, '')
      `, [largeAuthorCSV]);
      
      const [countResult] = await connection.query(`SELECT COUNT(*) as count FROM Autor`);
      console.log(`Total authors in database: ${countResult[0].count}`);
      
    } finally {
      await connection.end();
      timer.end('insert_authors');
    }
    
  } catch (error) {
    console.error("Error generating and inserting authors:", error);
  } finally {
    timer.end('generate_insert_authors');
  }
}

async function exportTablesToCSV() {
  timer.start('export_tables_csv');
  
  try {
    const connection = await getConnection();
    
    // Export Libro table
    timer.start('export_books');
    const [books] = await connection.query(`SELECT * FROM Libro`);
    fs.writeFileSync(exportedBooksCSV, 
      'id,ISBN,title,autor_license,editorial,pages,year,genre,language,format,sinopsis,content\n' +
      books.map(book => {
        return `${book.id},"${book.ISBN}","${book.title}","${book.autor_license || ''}","${book.editorial || ''}",${book.pages || ''},${book.year || ''},"${book.genre || ''}","${book.language || ''}","${book.format || ''}","${book.sinopsis?.replace(/"/g, '""') || ''}","${book.content?.replace(/"/g, '""') || ''}"`;
      }).join('\n')
    );
    timer.end('export_books');
    
    // Export Autor table
    timer.start('export_authors');
    const [authors] = await connection.query(`SELECT * FROM Autor`);
    fs.writeFileSync(exportedAuthorsCSV,
      'id,license,name,lastName,secondLastName,year\n' +
      authors.map(author => {
        return `${author.id},"${author.license}","${author.name}","${author.lastName || ''}","${author.secondLastName || ''}",${author.year || ''}`;
      }).join('\n')
    );
    timer.end('export_authors');
    
    console.log(`Exported ${books.length} books and ${authors.length} authors to CSV`);
    
  } catch (error) {
    console.error("Error exporting tables to CSV:", error);
  } finally {
    timer.end('export_tables_csv');
  }
}

async function migrateAndRestore() {
  timer.start('migrate_restore');
  
  try {
    // Step 1: Export from MySQL to MongoDB
    timer.start('export_to_mongodb');
    
    // Connect to MongoDB
    const mongoClient = new MongoClient(config.mongo.uri);
    await mongoClient.connect();
    const db = mongoClient.db(config.mongo.database);
    
    // Create collections
    await db.createCollection('Libros');
    await db.createCollection('Autores');
    
    // Import data from MySQL
    const connection = await getConnection();
    const [books] = await connection.query(`SELECT * FROM Libro`);
    const [authors] = await connection.query(`SELECT * FROM Autor`);
    
    // Insert into MongoDB
    if (books.length > 0) {
      await db.collection('Libros').insertMany(books);
    }
    
    if (authors.length > 0) {
      await db.collection('Autores').insertMany(authors);
    }
    
    await mongoClient.close();
    await connection.end();
    
    console.log(`Migrated ${books.length} books and ${authors.length} authors to MongoDB`);
    timer.end('export_to_mongodb');
    
    // Step 2: Delete data from MySQL
    timer.start('delete_from_mysql');
    const connDelete = await getConnection();
    
    // Disable foreign key checks for deletion
    await connDelete.query(`SET FOREIGN_KEY_CHECKS = 0`);
    await connDelete.query(`TRUNCATE Libro`);
    await connDelete.query(`TRUNCATE Autor`);
    await connDelete.query(`SET FOREIGN_KEY_CHECKS = 1`);
    
    await connDelete.end();
    timer.end('delete_from_mysql');
    
    // Step 3: Export from MongoDB (to temporary files)
    timer.start('export_from_mongodb');
    
    const mongoExportBooks = new Process("mongoexport");
    mongoExportBooks.ProcessArguments.push(`--uri=${config.mongo.uri}/${config.mongo.database}`);
    mongoExportBooks.ProcessArguments.push("--collection=Libros");
    mongoExportBooks.ProcessArguments.push("--out=mongodb_books.json");
    await mongoExportBooks.ExecuteAsync(true);
    
    const mongoExportAuthors = new Process("mongoexport");
    mongoExportAuthors.ProcessArguments.push(`--uri=${config.mongo.uri}/${config.mongo.database}`);
    mongoExportAuthors.ProcessArguments.push("--collection=Autores");
    mongoExportAuthors.ProcessArguments.push("--out=mongodb_authors.json");
    await mongoExportAuthors.ExecuteAsync(true);
    
    timer.end('export_from_mongodb');
    
    // Step 4: Restore to MySQL
    timer.start('restore_to_mysql');
    
    // Process and restore authors first (for foreign key constraints)
    const authorsJson = JSON.parse(fs.readFileSync('mongodb_authors.json', 'utf-8'));
    const booksJson = JSON.parse(fs.readFileSync('mongodb_books.json', 'utf-8'));
    
    const connRestore = await getConnection();
    
    // Insert authors
    if (authorsJson.length > 0) {
      // Generate values string for bulk insert
      const authorValues = authorsJson.map(author => 
        `(${author.id}, "${author.license}", "${author.name}", 
          ${author.lastName ? `"${author.lastName}"` : 'NULL'}, 
          ${author.secondLastName ? `"${author.secondLastName}"` : 'NULL'}, 
          ${author.year || 'NULL'})`
      ).join(',');
      
      await connRestore.query(`
        INSERT INTO Autor (id, license, name, lastName, secondLastName, year)
        VALUES ${authorValues}
      `);
    }
    
    // Insert books in batches to avoid query size limits
    if (booksJson.length > 0) {
      const batchSize = 1000;
      for (let i = 0; i < booksJson.length; i += batchSize) {
        const batch = booksJson.slice(i, i + batchSize);
        
        const bookValues = batch.map(book => 
          `(${book.id}, "${book.ISBN}", "${book.title}", 
            ${book.autor_license ? `"${book.autor_license}"` : 'NULL'}, 
            ${book.editorial ? `"${book.editorial}"` : 'NULL'}, 
            ${book.pages || 'NULL'}, ${book.year}, 
            ${book.genre ? `"${book.genre}"` : 'NULL'}, 
            "${book.language}", 
            ${book.format ? `"${book.format}"` : 'NULL'}, 
            ${book.sinopsis ? `"${book.sinopsis.replace(/"/g, '\\"')}"` : 'NULL'}, 
            ${book.content ? `"${book.content.replace(/"/g, '\\"')}"` : 'NULL'})`
        ).join(',');
        
        await connRestore.query(`
          INSERT INTO Libro (id, ISBN, title, autor_license, editorial, pages, year, genre, language, format, sinopsis, content)
          VALUES ${bookValues}
        `);
        
        console.log(`Restored ${Math.min(i + batchSize, booksJson.length)} of ${booksJson.length} books`);
      }
    }
    
    await connRestore.end();
    timer.end('restore_to_mysql');
    
  } catch (error) {
    console.error("Error during migration and restoration:", error);
  } finally {
    timer.end('migrate_restore');
  }
}

async function mysqlDump() {
  timer.start('mysql_dump');
  
  const dumpProcess = new Process("mysqldump");
  dumpProcess.ProcessArguments.push(`-h${config.mysql.host}`);
  dumpProcess.ProcessArguments.push(`-u${config.mysql.user}`);
  dumpProcess.ProcessArguments.push(`--password=${config.mysql.password}`);
  dumpProcess.ProcessArguments.push(config.mysql.database);
  dumpProcess.ProcessArguments.push("--result-file=full_database_dump.sql");
  
  try {
    await dumpProcess.ExecuteAsync(true);
    console.log("MySQL database dump completed");
  } catch (error) {
    console.error("Error creating MySQL dump:", error);
  } finally {
    timer.end('mysql_dump');
  }
}

async function mysqlRestore() {
  timer.start('mysql_restore');
  
  // First, we'll drop and recreate the database
  try {
    const connReset = await mysql.createConnection({
      host: config.mysql.host,
      user: config.mysql.user,
      password: config.mysql.password
    });
    
    await connReset.query(`DROP DATABASE IF EXISTS ${config.mysql.database}`);
    await connReset.query(`CREATE DATABASE ${config.mysql.database}`);
    await connReset.end();
    
    // Now restore from the dump file
    const restoreProcess = new Process("mysql", {
      shell: true
    });
    restoreProcess.ProcessArguments.push(`-h${config.mysql.host}`);
    restoreProcess.ProcessArguments.push(`-u${config.mysql.user}`);
    restoreProcess.ProcessArguments.push(`--password=${config.mysql.password}`);
    restoreProcess.ProcessArguments.push(`${config.mysql.database} < full_database_dump.sql`);
    
    await restoreProcess.ExecuteAsync(true);
    console.log("MySQL database restore completed");
    
  } catch (error) {
    console.error("Error restoring MySQL dump:", error);
  } finally {
    timer.end('mysql_restore');
  }
}

async function testPermissionFailures() {
  // Test userC trying to insert an author
  timer.start('userC_insert_author_fail');
  try {
    const connC = await mysql.createConnection({
      host: config.mysql.host,
      user: 'userC',
      password: 'passwordC',
      database: config.mysql.database
    });
    
    try {
      await connC.query(`
        INSERT INTO Autor (license, name, lastName, year) 
        VALUES ('XYZ-123456-AB', 'Test', 'Author', 1980)
      `);
      console.log("❌ UserC inserted author - should have failed!");
    } catch (error) {
      console.log("✅ UserC failed to insert author (expected)");
    } finally {
      await connC.end();
    }
  } catch (error) {
    console.log("✅ UserC could not connect (expected)");
  }
  timer.end('userC_insert_author_fail');
  
  // Test userC trying to insert a book
  timer.start('userC_insert_book_fail');
  try {
    const connC = await mysql.createConnection({
      host: config.mysql.host,
      user: 'userC',
      password: 'passwordC',
      database: config.mysql.database
    });
    
    try {
      await connC.query(`
        INSERT INTO Libro (ISBN, title, year, language) 
        VALUES ('1234567890123', 'Test Book', 2020, 'English')
      `);
      console.log("❌ UserC inserted book - should have failed!");
    } catch (error) {
      console.log("✅ UserC failed to insert book (expected)");
    } finally {
      await connC.end();
    }
  } catch (error) {
    console.log("✅ UserC could not connect (expected)");
  }
  timer.end('userC_insert_book_fail');
}

function generatePerformanceReport(metrics) {
  // Create report data
  const reportData = {
    testResults: [
      { name: 'Generate 100,000 Books CSV', time: metrics.generate_large_books_csv?.duration || 0 },
      { name: 'Insert CSV into MySQL', time: metrics.insert_large_books_csv?.duration || 0 },
      { name: 'Stress Test (3,500 books)', time: metrics.stress_test_mysql?.duration || 0 },
      { name: 'Generate 100 CSV Files', time: metrics.generate_multiple_csv?.duration || 0 },
      { name: 'Insert Multiple CSV Files', time: metrics.insert_multiple_csv?.duration || 0 },
      { name: 'Complex Query Execution', time: metrics.complex_query?.duration || 0 },
      { name: 'Generate & Insert 150,000 Authors', time: metrics.generate_insert_authors?.duration || 0 },
      { name: 'Export Tables to CSV', time: metrics.export_tables_csv?.duration || 0 },
      { name: 'Migrate & Restore MySQL/MongoDB', time: metrics.migrate_restore?.duration || 0 },
      { name: 'MySQL Database Dump', time: metrics.mysql_dump?.duration || 0 },
      { name: 'MySQL Database Restore', time: metrics.mysql_restore?.duration || 0 },
      { name: 'Permission Failure Tests', time: metrics.userC_insert_author_fail?.duration + metrics.userC_insert_book_fail?.duration || 0 },
    ],
    totalTime: metrics.total_performance_test?.duration || 0
  };
  
  // Generate HTML report
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MySQL Performance Test Results</title>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <style>
          body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              margin: 0;
              padding: 20px;
              color: #333;
          }
          .container {
              max-width: 1200px;
              margin: 0 auto;
          }
          h1, h2 {
              color: #2c3e50;
          }
          .summary {
              background-color: #f8f9fa;
              padding: 15px;
              border-radius: 5px;
              margin-bottom: 20px;
          }
          table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
          }
          th, td {
              padding: 12px 15px;
              border: 1px solid #ddd;
              text-align: left;
          }
          th {
              background-color: #4CAF50;
              color: white;
          }
          tr:nth-child(even) {
              background-color: #f2f2f2;
          }
          .chart-container {
              margin: 20px 0;
              height: 400px;
          }
          .footer {
              text-align: center;
              margin-top: 30px;
              font-size: 0.8em;
              color: #7f8c8d;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <h1>MySQL Performance Test Results</h1>
          
          <div class="summary">
              <h2>Summary</h2>
              <p><strong>Total Execution Time:</strong> ${reportData.totalTime} ms (${(reportData.totalTime / 1000 / 60).toFixed(2)} minutes)</p>
          </div>
          
          <h2>Test Results</h2>
          <table>
              <thead>
                  <tr>
                      <th>Test</th>
                      <th>Time (ms)</th>
                      <th>Time (sec)</th>
                  </tr>
              </thead>
              <tbody>
                  ${reportData.testResults.map(test => `
                      <tr>
                          <td>${test.name}</td>
                          <td>${test.time}</td>
                          <td>${(test.time / 1000).toFixed(2)}</td>
                      </tr>
                  `).join('')}
              </tbody>
          </table>
          
          <div class="chart-container">
              <canvas id="performanceChart"></canvas>
          </div>
          
          <div class="footer">
              <p>Generated on ${new Date().toLocaleString()}</p>
          </div>
      </div>
      
      <script>
          const ctx = document.getElementById('performanceChart').getContext('2d');
          new Chart(ctx, {
              type: 'bar',
              data: {
                  labels: ${JSON.stringify(reportData.testResults.map(test => test.name))},
                  datasets: [{
                      label: 'Execution Time (ms)',
                      data: ${JSON.stringify(reportData.testResults.map(test => test.time))},
                      backgroundColor: 'rgba(54, 162, 235, 0.5)',
                      borderColor: 'rgba(54, 162, 235, 1)',
                      borderWidth: 1
                  }]
              },
              options: {
                  scales: {
                      y: {
                          beginAtZero: true,
                          title: {
                              display: true,
                              text: 'Time (ms)'
                          }
                      },
                      x: {
                          ticks: {
                              maxRotation: 45,
                              minRotation: 45
                          }
                      }
                  },
                  plugins: {
                      title: {
                          display: true,
                          text: 'Performance Metrics by Test',
                          font: {
                              size: 18
                          }
                      }
                  },
                  responsive: true,
                  maintainAspectRatio: false
              }
          });
      </script>
  </body>
  </html>
  `;
  
  fs.writeFileSync('performance_report.html', html);
  console.log('Performance report generated: performance_report.html');
}

runTests();
