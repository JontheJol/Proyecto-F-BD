require('dotenv').config();
const mysql = require('mysql2/promise');
const Timer = require('../utils/timing');
const fs = require('fs');

const timer = new Timer();
const config = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'utt',
  database: 'LibrosAutores' // We'll create this database
};

async function setupSchema() {
  timer.start('total_schema_setup');
  let connection;
  
  try {
    // Connect without database to create it
    connection = await mysql.createConnection({
      host: config.host,
      user: config.user,
      password: config.password
    });
    
    console.log("Connected to MySQL server");
    
    // Create database
    timer.start('database_creation');
    await connection.query(`DROP DATABASE IF EXISTS ${config.database}`);
    await connection.query(`CREATE DATABASE ${config.database}`);
    timer.end('database_creation');
    
    // Select the database
    await connection.query(`USE ${config.database}`);
    
    // Create tables
    timer.start('table_creation');
    await connection.query(`
      CREATE TABLE Autor (
        id INT AUTO_INCREMENT PRIMARY KEY,
        license VARCHAR(12) NOT NULL UNIQUE,
        name TINYTEXT NOT NULL,
        lastName TINYTEXT,
        secondLastName TINYTEXT,
        year SMALLINT
      )
    `);
    
    await connection.query(`
      CREATE TABLE Libro (
        id INT AUTO_INCREMENT PRIMARY KEY, 
        ISBN VARCHAR(16) NOT NULL UNIQUE,
        title VARCHAR(512) NOT NULL,
        autor_license VARCHAR(12),
        editorial TINYTEXT,
        pages SMALLINT,
        year SMALLINT NOT NULL,
        genre TINYTEXT,
        language TINYTEXT NOT NULL,
        format TINYTEXT,
        sinopsis TEXT,
        content TEXT,
        FOREIGN KEY (autor_license) REFERENCES Autor(license)
      )
    `);
    timer.end('table_creation');
    
    console.log("Database schema created successfully");
    
  } catch (error) {
    console.error("Error setting up database schema:", error);
  } finally {
    if (connection) {
      await connection.end();
    }
    timer.end('total_schema_setup');
    console.log("\nSchema Creation Performance:");
    console.log(JSON.stringify(timer.getMetrics(), null, 2));
    
    // Update environment settings
    updateEnvFile();
  }
}

function updateEnvFile() {
  // Read existing .env file
  const envPath = './.env';
  let envContent = '';
  
  try {
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Update or add database name
    if (envContent.includes('MYSQL_DATABASE=')) {
      envContent = envContent.replace(
        /MYSQL_DATABASE=.*/g,
        `MYSQL_DATABASE=${config.database}`
      );
    } else {
      envContent += `\nMYSQL_DATABASE=${config.database}`;
    }
    
    // Update MongoDB database name to match
    if (envContent.includes('MONGO_URI=')) {
      envContent = envContent.replace(
        /MONGO_URI=.*/g,
        `MONGO_URI=mongodb://localhost:27017/${config.database}`
      );
    } else {
      envContent += `\nMONGO_URI=mongodb://localhost:27017/${config.database}`;
    }
    
    // Write back to .env file
    fs.writeFileSync(envPath, envContent);
    console.log("Environment variables updated");
    
  } catch (error) {
    console.error("Error updating environment file:", error);
  }
}

setupSchema();
