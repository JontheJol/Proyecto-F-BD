require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const Timer = require('./utils/timing');
const config = require('./utils/config');

// Configuration
const tmpDir = config.paths.tmpDir;
const exportedBooksCSV = path.join(tmpDir, 'exported_books.csv');
const exportedAuthorsCSV = path.join(tmpDir, 'exported_authors.csv');
const timer = new Timer();

// Helper function to get database connection
async function getConnection(user = config.mysql.user, password = config.mysql.password) {
  return await mysql.createConnection({
    host: config.mysql.host,
    user,
    password,
    database: config.mysql.database,
    multipleStatements: true
  });
}

// Export books to CSV in batches to avoid memory issues
async function exportBooksToCSV() {
  timer.start('export_books');
  let connection;
  
  try {
    connection = await getConnection();
    console.log("Connected to database, counting books...");
    
    // Get count of books
    const [countResult] = await connection.query(`SELECT COUNT(*) as count FROM Libro`);
    const totalBooks = countResult[0].count;
    console.log(`Found ${totalBooks} books to export`);
    
    // Create CSV file with header
    fs.writeFileSync(exportedBooksCSV, 
      'id,ISBN,title,autor_license,editorial,pages,year,genre,language,format,sinopsis,content\n'
    );
    
    // Export in batches
    const batchSize = 5000;
    let exportedCount = 0;
    
    while (exportedCount < totalBooks) {
      console.log(`Exporting books ${exportedCount} to ${Math.min(exportedCount + batchSize, totalBooks)}`);
      
      const [books] = await connection.query(`
        SELECT * FROM Libro 
        ORDER BY id 
        LIMIT ? OFFSET ?
      `, [batchSize, exportedCount]);
      
      // Process each book carefully
      let batchContent = '';
      for (const book of books) {
        try {
          // Handle each field carefully to avoid errors
          const line = [
            book.id,
            `"${(book.ISBN || '').replace(/"/g, '""')}"`,
            `"${(book.title || '').replace(/"/g, '""')}"`,
            `"${(book.autor_license || '').replace(/"/g, '""')}"`,
            `"${(book.editorial || '').replace(/"/g, '""')}"`,
            book.pages || '',
            book.year || '',
            `"${(book.genre || '').replace(/"/g, '""')}"`,
            `"${(book.language || '').replace(/"/g, '""')}"`,
            `"${(book.format || '').replace(/"/g, '""')}"`,
            `"${(book.sinopsis || '').replace(/"/g, '""')}"`,
            `"${(book.content || '').replace(/"/g, '""')}"`
          ].join(',');
          
          batchContent += line + '\n';
        } catch (err) {
          console.error(`Error processing book ID ${book.id}:`, err);
        }
      }
      
      // Append to file
      fs.appendFileSync(exportedBooksCSV, batchContent);
      exportedCount += books.length;
      console.log(`Exported ${exportedCount} of ${totalBooks} books`);
    }
    
    console.log(`✅ Successfully exported ${exportedCount} books to ${exportedBooksCSV}`);
  } catch (error) {
    console.error("❌ Error exporting books:", error);
  } finally {
    if (connection) await connection.end();
    timer.end('export_books');
  }
}

// Export authors to CSV in batches to avoid memory issues
async function exportAuthorsToCSV() {
  timer.start('export_authors');
  let connection;
  
  try {
    connection = await getConnection();
    console.log("Connected to database, counting authors...");
    
    // Get count of authors
    const [countResult] = await connection.query(`SELECT COUNT(*) as count FROM Autor`);
    const totalAuthors = countResult[0].count;
    console.log(`Found ${totalAuthors} authors to export`);
    
    // Create CSV file with header
    fs.writeFileSync(exportedAuthorsCSV, 
      'id,license,name,lastName,secondLastName,year\n'
    );
    
    // Export in batches
    const batchSize = 5000;
    let exportedCount = 0;
    
    while (exportedCount < totalAuthors) {
      console.log(`Exporting authors ${exportedCount} to ${Math.min(exportedCount + batchSize, totalAuthors)}`);
      
      const [authors] = await connection.query(`
        SELECT * FROM Autor
        ORDER BY id
        LIMIT ? OFFSET ?
      `, [batchSize, exportedCount]);
      
      // Process each author carefully
      let batchContent = '';
      for (const author of authors) {
        try {
          const line = [
            author.id,
            `"${(author.license || '').replace(/"/g, '""')}"`,
            `"${(author.name || '').replace(/"/g, '""')}"`,
            `"${(author.lastName || '').replace(/"/g, '""')}"`,
            `"${(author.secondLastName || '').replace(/"/g, '""')}"`,
            author.year || ''
          ].join(',');
          
          batchContent += line + '\n';
        } catch (err) {
          console.error(`Error processing author ID ${author.id}:`, err);
        }
      }
      
      // Append to file
      fs.appendFileSync(exportedAuthorsCSV, batchContent);
      exportedCount += authors.length;
      console.log(`Exported ${exportedCount} of ${totalAuthors} authors`);
    }
    
    console.log(`✅ Successfully exported ${exportedCount} authors to ${exportedAuthorsCSV}`);
  } catch (error) {
    console.error("❌ Error exporting authors:", error);
  } finally {
    if (connection) await connection.end();
    timer.end('export_authors');
  }
}

async function main() {
  timer.start('total');
  console.log('🔍 Debug: Export Tables to CSV');
  console.log('============================');
  
  try {
    await exportBooksToCSV();
    await exportAuthorsToCSV();
  } catch (error) {
    console.error('❌ Unhandled error:', error);
  } finally {
    timer.end('total');
    console.log('\n📊 Performance Metrics:');
    console.log(JSON.stringify(timer.getMetrics(), null, 2));
  }
}

main();
