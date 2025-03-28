require('dotenv').config();
const Process = require("./utils/Process");
const { MongoClient } = require('mongodb');
const mysql = require('mysql2/promise');

function random_number(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function random_text(characters_num) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let text = "";
    for(let i = 0; i < characters_num; i++) {
        text += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return text;
}


function generateStudentRecord() {
    const matricula = Math.random().toFixed(7).toString().replace('.', '');
    const año = Math.random().toFixed(3).toString().replace('.', '');
    const nombre = random_text(random_number(5, 20));
    const apellidos = random_text(random_number(10, 40));
    const password = random_text(random_number(8, 16));
    
    return {
        matricula,
        año: parseInt(año),
        nombre,
        apellidos,
        password
    };
}

async function setupMySQL() {
    const host = process.env.MYSQL_HOST || 'localhost';
    const user = process.env.MYSQL_USER || 'root';
    const password = process.env.MYSQL_PASSWORD || 'utt';
    
    try {
        const connection = await mysql.createConnection({
            host,
            user,
            password
        });
        
        // Create database if it doesn't exist ,Important when using docker mysql!
        await connection.query('CREATE DATABASE IF NOT EXISTS Alumnos');
        await connection.query('USE Alumnos');
        
        await connection.query(`
            CREATE TABLE IF NOT EXISTS Alumno (
                matricula VARCHAR(10) PRIMARY KEY,
                año INT,
                nombre VARCHAR(50),
                apellidos VARCHAR(100),
                password VARCHAR(50)
            )
        `);
        
        await connection.end();
        console.log('MySQL setup completed successfully');
    } catch (error) {
        console.error('Error setting up MySQL:', error);
        throw error;
    }
}

//Setup MongoDB database and collection Rememeber to update the env!!!!!!!
async function setupMongoDB() {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
    
    try {
        const client = new MongoClient(mongoUri);
        await client.connect();
        
        const db = client.db('Alumnos');
        // Create collection if it doesn't exist, Important when using docker Mondongo!
        if (!await db.listCollections({ name: 'Alumno' }).hasNext()) {
            await db.createCollection('Alumno');
            console.log('MongoDB collection created');
        }
        
        await client.close();
        console.log('MongoDB setup completed successfully');
    } catch (error) {
        console.error('Error setting up MongoDB:', error);
        throw error;
    }
}

async function insertIntoMySQL(batchSize, totalRecords) {
    const host = process.env.MYSQL_HOST || 'localhost';
    const user = process.env.MYSQL_USER || 'root';
    const password = process.env.MYSQL_PASSWORD || 'utt';
    
    try {
        const connection = await mysql.createConnection({
            host,
            user,
            password,
            database: 'Alumnos',
            multipleStatements: true
        });
        
        let inserted = 0;
        const batchCount = Math.ceil(totalRecords / batchSize);
        
        for (let b = 0; b < batchCount; b++) {
            const records = [];
            const currentBatchSize = Math.min(batchSize, totalRecords - inserted);
            
            for (let i = 0; i < currentBatchSize; i++) {
                const student = generateStudentRecord();
                records.push([
                    student.matricula,
                    student.año,
                    student.nombre,
                    student.apellidos,
                    student.password
                ]);
            }
            
            await connection.query(
                'INSERT INTO Alumno (matricula, año, nombre, apellidos, password) VALUES ?',
                [records]
            );
            
            inserted += currentBatchSize;
            console.log(`MySQL: Inserted batch ${b+1}/${batchCount} (${inserted}/${totalRecords} records)`);
        }
        
        await connection.end();
        console.log('MySQL data insertion completed');
    } catch (error) {
        console.error('Error inserting into MySQL:', error);
        throw error;
    }
}

// Insert data into MongoDB in batches, Impoertant when using docker or JonJol computer !
async function insertIntoMongoDB(batchSize, totalRecords) {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
    
    try {
        const client = new MongoClient(mongoUri);
        await client.connect();
        
        const collection = client.db('Alumnos').collection('Alumno');
        let inserted = 0;
        const batchCount = Math.ceil(totalRecords / batchSize);
        
        for (let b = 0; b < batchCount; b++) {
            const records = [];
            const currentBatchSize = Math.min(batchSize, totalRecords - inserted);
            
            for (let i = 0; i < currentBatchSize; i++) {
                records.push(generateStudentRecord());
            }
            
            await collection.insertMany(records);
            
            inserted += currentBatchSize;
            console.log(`MongoDB: Inserted batch ${b+1}/${batchCount} (${inserted}/${totalRecords} records)`);
        }
        
        await client.close();
        console.log('MongoDB data insertion completed');
    } catch (error) {
        console.error('Error inserting into MongoDB:', error);
        throw error;
    }
}

// Main function ,made For stability 
async function main() {
    try {
        const totalRecords = 100000;
        const batchSize = 1000;
        
        console.log('Setting up databases...');
        await setupMySQL();
        await setupMongoDB();
        
        console.log('Starting data insertion...');
        await Promise.all([
            insertIntoMySQL(batchSize, totalRecords),
            insertIntoMongoDB(batchSize, totalRecords)
        ]);
        
        console.log('Data generation completed successfully');
    } catch (error) {
        console.error('Error in main process:', error);
    }
}

// Run the script , this will not stop the node automaticly 
main();