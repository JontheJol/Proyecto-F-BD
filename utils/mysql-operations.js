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

async function batchInsertFromCSV(filePath, tableName, fields, transformRow = null) {
    console.log(`Batch inserting data from ${filePath} into ${tableName}...`);
    
    // Read and parse the CSV file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const rows = fileContent.split('\n');
    const headers = rows[0].split(',');
    
    // Skip header row
    const dataRows = rows.slice(1).filter(row => row.trim());
    
    if (dataRows.length === 0) {
        console.log("No data rows found in CSV");
        return 0;
    }
    
    let connection;
    let insertedCount = 0;
    
    try {
        connection = await getConnection();
        
        // Use batch inserts for better performance
        const batchSize = 1000;
        for (let i = 0; i < dataRows.length; i += batchSize) {
            const batch = dataRows.slice(i, i + batchSize);
            const values = [];
            const placeholders = [];
            
            batch.forEach(row => {
                try {
                    const rowData = parseCSVRow(row);
                    if (transformRow) {
                        const transformed = transformRow(rowData, headers);
                        if (transformed) {
                            values.push(...transformed.values);
                            placeholders.push(`(${transformed.placeholders})`);
                        }
                    } else {
                        // Default transformation: use all fields
                        values.push(...rowData);
                        placeholders.push(`(${Array(rowData.length).fill('?').join(',')})`);
                    }
                } catch (err) {
                    console.error(`Error parsing row: ${row}`, err);
                }
            });
            
            if (placeholders.length > 0) {
                // Build query
                const query = `INSERT INTO ${tableName} (${fields.join(',')}) VALUES ${placeholders.join(',')}`;
                await connection.query(query, values);
                insertedCount += placeholders.length;
            }
            
            // Log progress
            if ((i + batchSize) >= dataRows.length || i % (batchSize * 5) === 0) {
                console.log(`Imported ${insertedCount} of ${dataRows.length} rows...`);
            }
        }
        
        return insertedCount;
    } catch (error) {
        console.error(`Error batch inserting from CSV: ${error.message}`);
        throw error;
    } finally {
        if (connection) await connection.end();
    }
}

// Helper function to parse CSV row, handling quoted values
function parseCSVRow(row) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        
        if (char === '"') {
            // Handle escaped quotes (two double quotes in a row)
            if (inQuotes && i + 1 < row.length && row[i + 1] === '"') {
                current += '"';
                i++; // Skip the next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    
    // Add the last field
    result.push(current);
    return result;
}

module.exports = {
    setupDatabase,
    insertData,
    fetchData,
    exportToCsv,
    batchInsertFromCSV,
    parseCSVRow  // Added this export to fix the error
};
