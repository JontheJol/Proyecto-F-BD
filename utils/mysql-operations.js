const mysql = require("mysql2/promise");
const fs = require('fs');
const os = require('os');
const config = require('./config');

async function getConnection(database = config.mysql.database) {
    return await mysql.createConnection({
        host: config.mysql.host,
        user: config.mysql.user,
        password: config.mysql.password,
        database
    });
}

async function setupDatabase() {
    try {
        // Connect without specifying database to create it if needed
        const connection = await mysql.createConnection({
            host: config.mysql.host,
            user: config.mysql.user,
            password: config.mysql.password
        });
        
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${config.mysql.database}`);
        await connection.query(`USE ${config.mysql.database}`);
        
        await connection.query(`
            CREATE TABLE IF NOT EXISTS test (
                id INT AUTO_INCREMENT PRIMARY KEY,
                x INT,
                y INT,
                z VARCHAR(100)
            )
        `);
        
        await connection.end();
        console.log('MySQL setup completed successfully');
        return true;
    } catch (error) {
        console.error('Error setting up MySQL:', error);
        throw error;
    }
}

async function insertData(data) {
    let connection;
    try {
        connection = await getConnection();
        console.log("Connected to MySQL for data insertion");

        await Promise.all(
            data.map(row =>
                connection.execute(
                    "INSERT INTO test (x, y, z) VALUES (?, ?, ?)",
                    [row.x, row.y, row.z]
                )
            )
        );
        console.log(`Successfully inserted ${data.length} records into MySQL`);
        return true;
    } catch (error) {
        console.error("MySQL insert error:", error);
        return false;
    } finally {
        if (connection) await connection.end();
    }
}

async function fetchData() {
    let connection;
    try {
        connection = await getConnection();
        console.log("Connected to MySQL for data fetch");
        
        const [rows] = await connection.execute('SELECT x, y, z FROM test');
        console.log(`Fetched ${rows.length} rows from MySQL`);
        return rows;
    } catch (error) {
        console.error("MySQL fetch error:", error);
        return [];
    } finally {
        if (connection) await connection.end();
    }
}

async function exportToCsv(filePath = config.paths.csvFilePath) {
    let connection;
    try {
        connection = await getConnection();
        console.log("Connected to MySQL for CSV export");

        // Handle export differently based on platform
        if (os.platform() === 'win32') {
            try {
                await connection.execute(`
                    SELECT * FROM test
                    INTO OUTFILE '${filePath.replace(/\\/g, '/')}'
                    FIELDS TERMINATED BY ','
                    LINES TERMINATED BY '\\n'
                `);
            } catch (err) {
                // If direct export fails, fallback to manual export
                const [rows] = await connection.execute('SELECT x, y, z FROM test');
                const csvContent = rows.map(row => `${row.x},${row.y},${row.z}`).join('\n');
                fs.writeFileSync(filePath, csvContent);
            }
        } else {
            // Linux/Mac approach
            const [rows] = await connection.execute('SELECT * FROM test');
            const csvContent = rows.map(row => `${row.x},${row.y},${row.z}`).join('\n');
            fs.writeFileSync(filePath, csvContent);
        }
        
        console.log(`Data exported successfully to ${filePath}`);
        return true;
    } catch (error) {
        console.error("MySQL CSV export error:", error);
        return false;
    } finally {
        if (connection) await connection.end();
    }
}

module.exports = {
    setupDatabase,
    insertData,
    fetchData,
    exportToCsv
};
