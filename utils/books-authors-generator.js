const { randomNumber, randomText } = require('./data-generator');
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('./config');

// Languages, genres, and formats for books
const languages = ['English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Russian', 'Portuguese', 'Italian', 'Dutch'];
const genres = ['Fiction', 'Non-Fiction', 'Science Fiction', 'Fantasy', 'Mystery', 'Thriller', 'Romance', 'Western', 'Horror', 'Biography', 'History', 'Academic'];
const formats = ['Hardcover', 'Paperback', 'E-book', 'Audio Book', 'Large Print', 'Pocket Edition'];
const editorials = ['Penguin', 'Random House', 'HarperCollins', 'Simon & Schuster', 'Macmillan', 'Hachette', 'Wiley', 'Scholastic', 'Oxford University Press'];

/**
 * Generate a random ISBN (10 digits for simplicity)
 */
function generateISBN() {
  // Generate a 13-digit ISBN
  let isbn = '978'; // Standard prefix
  for (let i = 0; i < 10; i++) {
    isbn += randomNumber(0, 9);
  }
  return isbn;
}

/**
 * Generate a random license ID
 */
function generateLicense() {
  // Format: ABC-123456-XY
  const letters1 = String.fromCharCode(65 + randomNumber(0, 25)) + 
                  String.fromCharCode(65 + randomNumber(0, 25)) + 
                  String.fromCharCode(65 + randomNumber(0, 25));
  const numbers = String(randomNumber(100000, 999999));
  const letters2 = String.fromCharCode(65 + randomNumber(0, 25)) + 
                  String.fromCharCode(65 + randomNumber(0, 25));
  
  return `${letters1}-${numbers}-${letters2}`;
}

/**
 * Generate random author data
 */
function generateAuthor(id = null) {
  const license = generateLicense();
  const name = randomText(randomNumber(3, 10));
  const lastName = randomText(randomNumber(4, 12));
  const secondLastName = Math.random() > 0.5 ? randomText(randomNumber(4, 12)) : null;
  const year = randomNumber(1900, 2000);
  
  return {
    id,
    license,
    name,
    lastName,
    secondLastName,
    year
  };
}

/**
 * Generate a batch of random authors
 */
function generateAuthors(count, startId = 1) {
  const authors = [];
  for (let i = 0; i < count; i++) {
    authors.push(generateAuthor(startId + i));
  }
  return authors;
}

/**
 * Generate random book data
 * @param {Array} authorLicenses - Array of existing author licenses to reference
 */
function generateBook(authorLicenses = [], id = null) {
  const isbn = generateISBN();
  const title = randomText(randomNumber(5, 50));
  // If authorLicenses is empty, leave autor_license as null
  const autorLicense = authorLicenses.length > 0 
    ? authorLicenses[randomNumber(0, authorLicenses.length - 1)] 
    : null;
  const editorial = editorials[randomNumber(0, editorials.length - 1)];
  const pages = randomNumber(50, 1200);
  const year = randomNumber(1900, 2023);
  const genre = genres[randomNumber(0, genres.length - 1)];
  const language = languages[randomNumber(0, languages.length - 1)];
  const format = formats[randomNumber(0, formats.length - 1)];
  const sinopsis = randomText(randomNumber(100, 500));
  const content = randomText(randomNumber(1000, 5000));
  
  return {
    id,
    isbn,
    title,
    autor_license: autorLicense,
    editorial,
    pages,
    year,
    genre,
    language,
    format,
    sinopsis,
    content
  };
}

/**
 * Generate a batch of random books
 */
function generateBooks(count, authorLicenses = [], startId = 1) {
  const books = [];
  for (let i = 0; i < count; i++) {
    books.push(generateBook(authorLicenses, startId + i));
  }
  return books;
}

/**
 * Convert authors to CSV format
 */
function authorsToCSV(authors) {
  const headers = 'id,license,name,lastName,secondLastName,year\n';
  const rows = authors.map(author => {
    return `${author.id || ''},"${author.license}","${author.name}","${author.lastName || ''}","${author.secondLastName || ''}",${author.year || ''}`;
  }).join('\n');
  
  return headers + rows;
}

/**
 * Convert books to CSV format
 */
function booksToCSV(books) {
  const headers = 'id,isbn,title,autor_license,editorial,pages,year,genre,language,format,sinopsis,content\n';
  const rows = books.map(book => {
    return `${book.id || ''},"${book.isbn}","${book.title}","${book.autor_license || ''}","${book.editorial || ''}",${book.pages || ''},${book.year || ''},"${book.genre || ''}","${book.language || ''}","${book.format || ''}","${book.sinopsis?.replace(/"/g, '""') || ''}","${book.content?.replace(/"/g, '""') || ''}"`;
  }).join('\n');
  
  return headers + rows;
}

/**
 * Save data to CSV file
 */
function saveToCSV(data, filename) {
  fs.writeFileSync(filename, data, 'utf8');
  console.log(`Data saved to ${filename}`);
  return filename;
}

/**
 * Generate multiple CSV files
 */
function generateMultipleCSV(count, itemsPerFile, generatorFn, toCsvFn, filePrefix) {
  const files = [];
  const tmpDir = config.paths.tmpDir;
  
  for (let i = 0; i < count; i++) {
    const data = generatorFn(itemsPerFile);
    const csvData = toCsvFn(data);
    const fileName = path.join(tmpDir, `${filePrefix}_${i+1}.csv`);
    
    fs.writeFileSync(fileName, csvData, 'utf8');
    files.push(fileName);
    
    // Log progress every 10 files
    if ((i + 1) % 10 === 0) {
      console.log(`Generated ${i + 1} of ${count} ${filePrefix} files`);
    }
  }
  
  return files;
}

module.exports = {
  generateISBN,
  generateLicense,
  generateAuthor,
  generateAuthors,
  generateBook,
  generateBooks,
  authorsToCSV,
  booksToCSV,
  saveToCSV,
  generateMultipleCSV
};
