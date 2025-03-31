require("dotenv").config();
const mysql = require("mysql2/promise");
const { exec } = require("child_process");
const mongopath =
    ";C:\\Users\\cotto\\Documents\\mongoo\\mongodb-windows-x86_64-8.0.4\\mongodb-win32-x86_64-windows-8.0.4\\bin";
const mysqlpath =
    "C:\\Users\\cotto\\Documents\\bd\\mysql-9.1.0-winx64\\mysql-9.1.0-winx64\\bin";
const fs = require("fs");
const path = require("path");
const Timer = require("./utils/timing");
const { MongoClient } = require("mongodb");
const Process = require("./utils/Process");
const config = require("./utils/config");
const {
    generateAuthors,
    generateBooks,
    authorsToCSV,
    booksToCSV,
    saveToCSV,
    generateMultipleCSV,
} = require("./utils/books-authors-generator");

// Update config for new database
config.mysql.database = process.env.MYSQL_DATABASE || "LibrosAutores";
config.mongo.database = process.env.MYSQL_DATABASE || "LibrosAutores";
config.mongo.collection = "Libros";

const timer = new Timer();
const tmpDir = config.paths.tmpDir;
const largeBookCSV = path.join(tmpDir, "large_books.csv");
const largeAuthorCSV = path.join(tmpDir, "large_authors.csv");
const exportedBooksCSV = path.join(tmpDir, "exported_books.csv");
const exportedAuthorsCSV = path.join(tmpDir, "exported_authors.csv");
const megaBookCSV = path.join(tmpDir, "mega_books.csv");
const allAuthorLicenses = [];

// Check for reduced data flag
const useReducedData = process.argv.includes("--reduced-data");
const BOOKS_COUNT = useReducedData ? 10000 : 100000;
const AUTHORS_COUNT = useReducedData ? 15000 : 150000;
const STRESS_TEST_COUNT = useReducedData ? 1000 : 3500;
const BATCH_FILES_COUNT = useReducedData ? 10 : 100;

async function getConnection(
    user = config.mysql.user,
    password = config.mysql.password
) {
    return await mysql.createConnection({
        host: config.mysql.host,
        user,
        password,
        database: config.mysql.database,
        multipleStatements: true,
    });
}

async function runTests() {
    timer.start("total_performance_test");
    console.log("Starting performance tests...");
    console.log(`Using ${useReducedData ? "REDUCED" : "FULL"} dataset sizes`);

    try {
        // Test 1: Create 100,000 books in CSV (or reduced amount)
        console.log(`\n📊 TEST 1: Generate ${BOOKS_COUNT} books CSV`);
        timer.start("generate_large_books_csv");

        // Generate books in chunks to prevent memory issues
        const chunkSize = 10000;
        const chunks = Math.ceil(BOOKS_COUNT / chunkSize);

        // Create the CSV header first
        fs.writeFileSync(
            largeBookCSV,
            "isbn,title,autor_license,editorial,pages,year,genre,language,format,sinopsis,content\n"
        );

        for (let i = 0; i < chunks; i++) {
            const currentCount = Math.min(
                chunkSize,
                BOOKS_COUNT - i * chunkSize
            );
            console.log(
                `Generating chunk ${i + 1}/${chunks} (${currentCount} books)`
            );

            const books = generateBooks(
                currentCount,
                allAuthorLicenses,
                i * chunkSize + 1
            );
            const booksCSV = booksToCSV(books).split("\n").slice(1).join("\n");
            fs.appendFileSync(largeBookCSV, booksCSV + "\n");
        }

        timer.end("generate_large_books_csv");

        // Test 2: Insert the CSV into MySQL
        console.log(`\n📊 TEST 2: Insert books CSV into MySQL`);
        await insertBooksCSVIntoMySQL(largeBookCSV);

        // Test 3: Insert books to stress test MySQL
        console.log(`\n📊 TEST 3: Stress test with ${STRESS_TEST_COUNT} books`);
        await stressTestMySQL();

        // Test 4: Generate CSV files with 1000 books each

        console.log(
            `\n📊 TEST 4: Generate ${BATCH_FILES_COUNT} CSV files (1000 books each)`
        );
        timer.start("generate_multiple_csv");
        const csvFiles = generateMultipleCSV(
            BATCH_FILES_COUNT,
            1000,
            (count) => generateBooks(count),
            booksToCSV,
            "books_batch"
        );
        timer.end("generate_multiple_csv");

        // Test 5: Insert all CSV files
        console.log("\n📊 TEST 5: Insert CSV files into MySQL");
        await insertMultipleCSVFiles(csvFiles);
        // Test 6: Complex query for statistics
        console.log("\n📊 TEST 6: Run complex statistics query");
        await runComplexQuery();

        // Test 7: Generate and insert authors
        console.log(
            `\n📊 TEST 7: Generate and insert ${AUTHORS_COUNT} authors`
        );
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

        // Test 13: Generate and export limited
        console.log("\n📊 TEST 13: Generate and export limited");
        const millionbooks = await generateandExport();

        // Test 14: Failed inserts with unauthorized users
        console.log("\n📊 TEST 14: ImportOldBooks");
        await importMysqlOldBooks(millionbooks);
    } catch (error) {
        console.error("Error running performance tests:", error);
    } finally {
        timer.end("total_performance_test");
        console.log("\n📈 Performance Test Results");
        console.log(JSON.stringify(timer.getMetrics(), null, 2));

        // Generate report
        generatePerformanceReport(timer.getMetrics());
    }
}

async function insertBooksCSVIntoMySQL(csvFilePath) {
    timer.start("insert_large_books_csv");

    try {
        // Use a regular table instead of a temporary table since we're using multiple connections
        const connection = await getConnection();
        try {
            console.log(
                "Loading CSV data directly into Libro using LOAD DATA INFILE..."
            );
            await connection.query(`SET FOREIGN_KEY_CHECKS = 0`);

            await connection.query(`
                LOAD DATA INFILE '${csvFilePath.replace(/\\/g, "/")}'
                INTO TABLE Libro
                FIELDS TERMINATED BY ',' 
                ENCLOSED BY '"'
                LINES TERMINATED BY '\\n'
                IGNORE 1 ROWS
                (ISBN, title, autor_license, editorial, pages, year, genre, language, format, sinopsis, content)
            `);

            console.log("CSV data loaded successfully into Libro.");
        } finally {
            await connection.end();
        }

        // Get count of inserted rows
        const connFinal = await getConnection();
        try {
            const [rows] = await connFinal.query(
                `SELECT COUNT(*) as count FROM Libro`
            );
            console.log(`Inserted ${rows[0].count} books from CSV`);
        } finally {
            await connFinal.end();
        }
    } catch (error) {
        console.error("Error inserting books from CSV:", error);
    } finally {
        timer.end("insert_large_books_csv");
    }
}

async function stressTestMySQL() {
    timer.start("stress_test_mysql");
    const connection = await getConnection();
    try {
        await connection.query(`SET FOREIGN_KEY_CHECKS = 0`);
        // Generate books for stress testing
        const stressBooks = generateBooks(STRESS_TEST_COUNT);
        // Use transaction for faster insertion
        await connection.beginTransaction();
        // Insert books in batches of 100
        const batchSize = 100;
        for (let i = 0; i < stressBooks.length; i += batchSize) {
            const batch = stressBooks.slice(i, i + batchSize);
            // Convert batch to values string for bulk insert
            const values = batch
                .map(
                    (book) =>
                        `("${book.isbn}", "${book.title}", ${
                            book.autor_license
                                ? `"${book.autor_license}"`
                                : "NULL"
                        }, 
          "${book.editorial}", ${book.pages}, ${book.year}, "${book.genre}", 
          "${book.language}", "${book.format}", "${book.sinopsis?.replace(
                            /"/g,
                            '\\"'
                        )}", 
          "${book.content?.replace(/"/g, '\\"')}")`
                )
                .join(",");
            // Execute bulk insert
            await connection.query(`
        INSERT INTO Libro 
          (ISBN, title, autor_license, editorial, pages, year, genre, language, format, sinopsis, content)
        VALUES ${values}
      `);
            // Log progress every 1000 books
            if (
                (i + batchSize) % 1000 === 0 ||
                i + batchSize >= stressBooks.length
            ) {
                console.log(
                    `Inserted ${Math.min(
                        i + batchSize,
                        stressBooks.length
                    )} of ${stressBooks.length} stress test books`
                );
            }
        }
        await connection.commit();
    } catch (error) {
        console.error("Error in stress test:", error);
        await connection.rollback();
    } finally {
        await connection.end();
        timer.end("stress_test_mysql");
    }
}

async function insertMultipleCSVFiles(csvFiles) {
    timer.start("insert_multiple_csv");
    try {
        let totalInserted = 0;
        const connection = await getConnection(); // Use a single connection

        await connection.query(`SET FOREIGN_KEY_CHECKS = 0`);

        for (let i = 0; i < csvFiles.length; i++) {
            const csvFile = csvFiles[i];
            console.log(`Loading file: ${csvFile}`);

            try {
                await connection.query(`
                    LOAD DATA INFILE '${csvFile.replace(/\\/g, "/")}'
                    INTO TABLE Libro
                    FIELDS TERMINATED BY ',' 
                    ENCLOSED BY '"'
                    LINES TERMINATED BY '\\n'
                    IGNORE 1 ROWS
                    (ISBN, title, autor_license, editorial, pages, year, genre, language, format, sinopsis, content)
                `);

                console.log(`✅ Successfully loaded: ${csvFile}`);
            } catch (err) {
                console.error(`❌ Error loading ${csvFile}:`, err);
            }

            // Log progress every 10 files
            if ((i + 1) % 10 === 0 || i === csvFiles.length - 1) {
                console.log(
                    `Processed ${i + 1} of ${csvFiles.length} CSV files`
                );
            }
        }

        // Get count of inserted rows
        const [rows] = await connection.query(
            `SELECT COUNT(*) as count FROM Libro`
        );
        totalInserted = rows[0].count;
        console.log(`📊 Total rows inserted: ${totalInserted}`);
    } catch (error) {
        console.error("Error inserting multiple CSV files:", error);
    } finally {
        timer.end("insert_multiple_csv");
    }
}

async function runComplexQuery() {
    timer.start("complex_query");
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
        timer.end("complex_query");
    }
}

async function generateAndInsertAuthors() {
    timer.start("generate_insert_authors");
    try {
        // Generate authors
        timer.start("generate_authors");
        // Generate in chunks to prevent memory issues
        const chunkSize = 10000;
        const chunks = Math.ceil(AUTHORS_COUNT / chunkSize);
        // Create the CSV header first
        fs.writeFileSync(
            largeAuthorCSV,
            "license,name,lastName,secondLastName,year\n"
        );
        for (let i = 0; i < chunks; i++) {
            const currentCount = Math.min(
                chunkSize,
                AUTHORS_COUNT - i * chunkSize
            );
            console.log(
                `Generating chunk ${i + 1}/${chunks} (${currentCount} authors)`
            );
            const startId = 51 + i * chunkSize; // Start ID after initial authors
            const authors = generateAuthors(currentCount, startId);
            const authorsCSV = authorsToCSV(authors)
                .split("\n")
                .slice(1)
                .join("\n");
            fs.appendFileSync(largeAuthorCSV, authorsCSV + "\n");
        }
        timer.end("generate_authors");
        // Insert authors using direct SQL instead of LOAD DATA INFILE
        timer.start("insert_authors");
        const connection = await getConnection();
        try {
            console.log(
                "Loading CSV data directly into Autores using LOAD DATA INFILE..."
            );

            await connection.query(`
                LOAD DATA INFILE '${largeAuthorCSV.replace(/\\/g, "/")}'
                INTO TABLE Autor
                FIELDS TERMINATED BY ',' 
                ENCLOSED BY '"'
                LINES TERMINATED BY '\\n'
                IGNORE 1 ROWS
                (license,name,lastName,secondLastName,year)
            `);

            console.log("CSV data loaded successfully into Autor.");
        } finally {
            await connection.end();
        }

        // Get count of inserted rows
        const connFinal = await getConnection();
        try {
            const [rows] = await connFinal.query(
                `SELECT COUNT(*) as count FROM Autor`
            );
            console.log(`Inserted ${rows[0].count} authors from CSV`);
        } finally {
            await connFinal.end();
        }
        timer.end("insert_authors");
    } catch (error) {
        console.error("Error generating and inserting authors:", error);
    } finally {
        timer.end("generate_insert_authors");
    }
}

async function exportTablesToCSV() {
    timer.start("export_tables_csv");
    try {
        const connection = await getConnection();

        // Export Libro table
        timer.start("export_books");
        await connection.query(`
                SELECT ISBN, title, autor_license, editorial, pages, year, genre, language, format, sinopsis, content
                FROM librosautores.libro
                INTO OUTFILE 'C:/Users/cotto/tmp/libros_mysql_export.txt'
                FIELDS TERMINATED BY ','
                LINES TERMINATED BY '\n';
                `);
        timer.end("export_books");

        // Export Autor table
        timer.start("export_authors");
        await connection.query(`
                SELECT license,name,lastName,secondLastName,year
                FROM librosautores.autor
                INTO OUTFILE 'C:/Users/cotto/tmp/autores_mysql_export.txt'
                FIELDS TERMINATED BY ','
                LINES TERMINATED BY '\n';
                `);
        timer.end("export_authors");
        console.log(`Exported books and authors to CSV`);
    } catch (error) {
        console.error("Error exporting tables to CSV:", error);
    } finally {
        timer.end("export_tables_csv");
    }
}

async function migrateAndRestore() {
    timer.start("migrate_restore");
    const authorsCsvPath = "C:/Users/cotto/tmp/autores_mysql_export.txt";
    const booksCsvPath = "C:/Users/cotto/tmp/libros_mysql_export.txt";
    try {
        // Step 1: Export from MySQL to MongoDB
        timer.start("export_to_mongodb");

        let mongoClient = null;
        let connectionSuccessful = false;

        const connectionOptions = [
            config.mongo.uri,
            "mongodb://localhost:27018/LibrosAutores",
            "mongodb://localhost:27018/",
        ];
        for (const uri of connectionOptions) {
            if (connectionSuccessful) break;
            try {
                console.log(
                    `Attempting MongoDB connection with URI: ${uri.replace(
                        /\/\/([^:]+):([^@]+)@/,
                        "//\\1:***@"
                    )}`
                );
                mongoClient = new MongoClient(uri, {
                    serverSelectionTimeoutMS: 5000,
                    connectTimeoutMS: 5000,
                });
                await mongoClient.connect();
                console.log("MongoDB connection successful");
                connectionSuccessful = true;
            } catch (connErr) {
                console.log(
                    `Connection failed with URI: ${uri}. Error: ${connErr.message}`
                );
                if (mongoClient) await mongoClient.close();
                mongoClient = null;
            }
        }

        if (!connectionSuccessful) {
            console.error(
                "All MongoDB connection attempts failed. Using direct export approach instead."
            );
            const directExport = await exportTablesDirectly();
            timer.end("export_to_mongodb");
            timer.end("migrate_restore");
            return directExport;
        }

        const db = mongoClient.db(config.mongo.database || "LibrosAutores");

        try {
            await db.createCollection("Libros");
            await db.createCollection("Autores");
        } catch (err) {
            console.log("Collections may already exist:", err.message);
        }

        const connection = await getConnection();
        await importCsvToMongo(
            "LibrosAutores",
            "Libros",
            booksCsvPath,
            "ISBN, title, autor_license, editorial, pages, year, genre, language, format, sinopsis, content"
        );
        await importCsvToMongo(
            "LibrosAutores",
            "Autores",
            authorsCsvPath,
            "license, name, lastName, secondLastName, year"
        );
        await mongoClient.close();
        await connection.end();

        console.log(`Migrated books and authors to MongoDB`);
        timer.end("export_to_mongodb");

        // Step 2: Delete data from MySQL
        timer.start("delete_from_mysql");
        const connDelete = await getConnection();

        await connDelete.query(`SET FOREIGN_KEY_CHECKS = 0`);
        await connDelete.query(`TRUNCATE Libro`);
        await connDelete.query(`TRUNCATE Autor`);
        await connDelete.query(`SET FOREIGN_KEY_CHECKS = 1`);

        await connDelete.end();
        timer.end("delete_from_mysql");

        const authorsMongoCsvPath =
            "C:/Users/cotto/tmp/autores_mongo_export.txt";
        const booksMongoCsvPath = "C:/Users/cotto/tmp/libros_mongo_export.txt";

        // Step 3: Export from MongoDB (to temporary files)
        await exportMongoCollections(
            "LibrosAutores",
            "Libros",
            booksMongoCsvPath,
            "ISBN, title, autor_license, editorial, pages, year, genre, language, format, sinopsis, content"
        );
        await exportMongoCollections(
            "LibrosAutores",
            "Autores",
            authorsMongoCsvPath,
            "license, name, lastName, secondLastName, year"
        );
        timer.end("export_from_mongodb");

        // Step 4: Restore to MySQL
        timer.start("restore_to_mysql");

        const connRestore = await getConnection();
        try {
            console.log(
                "Loading CSV data directly into Libro using LOAD DATA INFILE..."
            );
            await connRestore.query(`SET FOREIGN_KEY_CHECKS = 0`);

            await connRestore.query(`
                LOAD DATA INFILE '${booksMongoCsvPath.replace(/\\/g, "/")}'
                INTO TABLE Libro
                FIELDS TERMINATED BY ',' 
                ENCLOSED BY '"'
                LINES TERMINATED BY '\\n'
                IGNORE 1 ROWS
                (ISBN, title, autor_license, editorial, pages, year, genre, language, format, sinopsis, content)
            `);

            console.log("CSV data loaded successfully into Libro.");

            await connRestore.query(`
                LOAD DATA INFILE '${authorsMongoCsvPath.replace(/\\/g, "/")}'
                INTO TABLE Autor
                FIELDS TERMINATED BY ',' 
                ENCLOSED BY '"'
                LINES TERMINATED BY '\\n'
                IGNORE 1 ROWS
                (license, name, lastName, secondLastName, year)
            `);

            console.log("CSV data loaded successfully into Author.");
        } finally {
            await connRestore.end();
        }
        timer.end("restore_to_mysql");
    } catch (error) {
        console.error("Error during migration and restoration:", error);
    } finally {
        timer.end("migrate_restore");
    }
}

function importCsvToMongo(database, collection, filePath, fields) {
    return new Promise((resolve, reject) => {
        const command = `${mongopath}\\mongoimport.exe --db ${database} --collection ${collection} --type csv --file "${filePath}" --fields "${fields}"`;

        console.log(`🔄 Running command: ${command}`);

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Error importing ${filePath}:`, error);
                return reject(error);
            }
            if (stderr) {
                console.warn(`⚠️ mongoimport warning for ${filePath}:`, stderr);
            }
            console.log(
                `✅ Successfully imported ${filePath} into ${database}.${collection}`
            );
            resolve(stdout);
        });
    });
}

async function exportMongoCollections(database, collection, filePath, fields) {
    timer.start("export_from_mongodb");

    return new Promise((resolve, reject) => {
        const command = `${mongopath}\\mongoexport.exe --db ${database} --collection ${collection} --type csv --fields "${fields}" --out "${filePath}"`;

        console.log(`🔄 Running command: ${command}`);

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Error exporting ${filePath}:`, error);
                return reject(error);
            }
            if (stderr) {
                console.warn(`⚠️ mongoexport warning for ${filePath}:`, stderr);
            }
            console.log(
                `✅ Successfully exported ${filePath} into ${database}.${collection}`
            );
            resolve(stdout);
        });
    });
}

async function exportTablesDirectly() {
    console.log("Using direct export approach instead of MongoDB");

    try {
        const connection = await getConnection();

        const [authors] = await connection.query(
            `SELECT * FROM Autor LIMIT 10000`
        );
        fs.writeFileSync("mongodb_authors.json", JSON.stringify(authors));
        console.log(`Directly exported ${authors.length} authors`);

        const [books] = await connection.query(
            `SELECT * FROM Libro LIMIT 10000`
        );
        fs.writeFileSync("mongodb_books.json", JSON.stringify(books));
        console.log(`Directly exported ${books.length} books`);

        await connection.end();
        return true;
    } catch (err) {
        console.error("Error during direct export:", err);
        return false;
    }
}

async function mysqlDump() {
    timer.start("mysql_dump");
    return new Promise((resolve, reject) => {
        const command = `${mysqlpath}\\mysqldump.exe --user=${process.env.MYSQL_USER} --password=${process.env.MYSQL_PASSWORD} LibrosAutores --result-file=C:\\Users\\cotto\\tmp\\mysqldump.sql`;

        console.log(`🔄 Running command: ${command}`);

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Error dumping database:`, error);
                return reject(error);
            }
            if (stderr) {
                console.warn(`⚠️ mysqldump warning for LibrosAutores:`, stderr);
            }
            console.log(`✅ Successfully dumped LibrosAutores`);
            resolve(stdout);
        });
    });
}

async function mysqlRestore() {
    timer.start("mysql_restore");

    try {
        const connReset = await mysql.createConnection({
            host: config.mysql.host,
            user: config.mysql.user,
            password: config.mysql.password,
        });
        await connReset.query(
            `DROP DATABASE IF EXISTS ${config.mysql.database}`
        );
        await connReset.query(`CREATE DATABASE ${config.mysql.database}`);
        await connReset.end();

        return new Promise((resolve, reject) => {
            const command = `${mysqlpath}\\mysql.exe --user=${process.env.MYSQL_USER} --password=${process.env.MYSQL_PASSWORD} LibrosAutores < C:\\Users\\cotto\\tmp\\mysqldump.sql`;

            console.log(`🔄 Running command: ${command}`);

            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`❌ Error restoring database:`, error);
                    return reject(error);
                }
                if (stderr) {
                    console.warn(`⚠️ mysql warning for LibrosAutores:`, stderr);
                }
                console.log(`✅ Successfully imported LibrosAutores`);
                resolve(stdout);
            });
        });
    } catch (error) {
        console.error("Error restoring MySQL dump:", error);
    } finally {
        timer.end("mysql_restore");
    }
}

async function testPermissionFailures() {
    timer.start("userC_insert_author_fail");
    try {
        const connC = await mysql.createConnection({
            host: config.mysql.host,
            user: "userC",
            password: "passwordC",
            database: config.mysql.database,
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
    timer.end("userC_insert_author_fail");

    timer.start("userC_insert_book_fail");
    try {
        const connC = await mysql.createConnection({
            host: config.mysql.host,
            user: "userC",
            password: "passwordC",
            database: config.mysql.database,
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
    timer.end("userC_insert_book_fail");
}

async function generateandExport() {
    const chunkSize = 10000;
    const chunks = Math.ceil(1000000 / chunkSize);

    fs.writeFileSync(
        megaBookCSV,
        "isbn,title,autor_license,editorial,pages,year,genre,language,format,sinopsis,content\n"
    );

    for (let i = 0; i < chunks; i++) {
        const currentCount = Math.min(chunkSize, 1000000 - i * chunkSize);
        console.log(
            `Generating chunk ${i + 1}/${chunks} (${currentCount} books)`
        );

        const books = generateBooks(currentCount, i * chunkSize + 1);
        const booksCSV = booksToCSV(books).split("\n").slice(1).join("\n");
        fs.appendFileSync(megaBookCSV, booksCSV + "\n");
    }
    console.log("Importing to mongo");
    try {
        let mongoClient = null;
        let connectionSuccessful = false;

        const connectionOptions = [
            config.mongo.uri,
            "mongodb://localhost:27018/LibrosAutores",
            "mongodb://localhost:27018/",
        ];
        for (const uri of connectionOptions) {
            if (connectionSuccessful) break;
            try {
                console.log(
                    `Attempting MongoDB connection with URI: ${uri.replace(
                        /\/\/([^:]+):([^@]+)@/,
                        "//\\1:***@"
                    )}`
                );
                mongoClient = new MongoClient(uri, {
                    serverSelectionTimeoutMS: 5000,
                    connectTimeoutMS: 5000,
                });
                await mongoClient.connect();
                console.log("MongoDB connection successful");
                connectionSuccessful = true;
            } catch (connErr) {
                console.log(
                    `Connection failed with URI: ${uri}. Error: ${connErr.message}`
                );
                if (mongoClient) await mongoClient.close();
                mongoClient = null;
            }
        }

        if (!connectionSuccessful) {
            console.error(
                "All MongoDB connection attempts failed. Using direct export approach instead."
            );
        }

        const db = mongoClient.db(config.mongo.database || "LibrosAutores");
        await db.dropCollection("Libros");
        await importCsvToMongo(
            "LibrosAutores",
            "Libros",
            megaBookCSV,
            "ISBN, title, autor_license, editorial, pages, year, genre, language, format, sinopsis, content"
        );
        await mongoClient.close();

        console.log(`Migrated books to MongoDB`);
        const limitedbooksMongoCsvPath =
            "C:/Users/cotto/tmp/limited_mongo_export.txt";

        await exportMongoCollections(
            "LibrosAutores",
            "Libros",
            limitedbooksMongoCsvPath,
            "ISBN, pages, year"
        );
        console.log("exported limited csv");
        return limitedbooksMongoCsvPath;
    } catch (error) {
        console.error("Error during migration and restoration:", error);
    }
}

async function importMysqlOldBooks(old_file) {
    try {
        const connection = await getConnection();
        try {
            console.log(
                "Loading CSV data directly into Libro using LOAD DATA INFILE..."
            );
            await connection.query(`SET FOREIGN_KEY_CHECKS = 0`);
            await connection.query(`
                CREATE TABLE IF NOT EXISTS old_books (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    ISBN VARCHAR(16),
                    pages SMALLINT,
                    year SMALLINT NOT NULL
                )
            `);
            await connection.query(`
                LOAD DATA INFILE '${old_file.replace(/\\/g, "/")}'
                INTO TABLE old_books
                FIELDS TERMINATED BY ',' 
                ENCLOSED BY '"'
                LINES TERMINATED BY '\\n'
                IGNORE 2 ROWS
                (ISBN, pages, year)
            `);

            console.log("CSV data loaded successfully into Libro.");
        } finally {
            await connection.end();
        }

        // Get count of inserted rows
        const connFinal = await getConnection();
        try {
            const [rows] = await connFinal.query(
                `SELECT COUNT(*) as count FROM old_books`
            );
            console.log(`Inserted ${rows[0].count} books from CSV`);
        } finally {
            await connFinal.end();
        }
    } catch (error) {
        console.error("Error inserting books from CSV:", error);
    }
}

function generatePerformanceReport(metrics) {
    const reportData = {
        testResults: [
            {
                name: "Generate Books CSV",
                time: metrics.generate_large_books_csv?.duration || 0,
            },
            {
                name: "Insert CSV into MySQL",
                time: metrics.insert_large_books_csv?.duration || 0,
            },
            {
                name: "Stress Test",
                time: metrics.stress_test_mysql?.duration || 0,
            },
            {
                name: "Generate CSV Files",
                time: metrics.generate_multiple_csv?.duration || 0,
            },
            {
                name: "Insert Multiple CSV Files",
                time: metrics.insert_multiple_csv?.duration || 0,
            },
            {
                name: "Complex Query Execution",
                time: metrics.complex_query?.duration || 0,
            },
            {
                name: "Generate & Insert Authors",
                time: metrics.generate_insert_authors?.duration || 0,
            },
            {
                name: "Export Tables to CSV",
                time: metrics.export_tables_csv?.duration || 0,
            },
            {
                name: "Migrate & Restore MySQL/MongoDB",
                time: metrics.migrate_restore?.duration || 0,
            },
            {
                name: "MySQL Database Dump",
                time: metrics.mysql_dump?.duration || 0,
            },
            {
                name: "MySQL Database Restore",
                time: metrics.mysql_restore?.duration || 0,
            },
            {
                name: "Permission Failure Tests",
                time:
                    metrics.userC_insert_author_fail?.duration +
                        metrics.userC_insert_book_fail?.duration || 0,
            },
        ],
        totalTime: metrics.total_performance_test?.duration || 0,
    };

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
              text-align: left;
              border: 1px solid #ddd;
              padding: 12px 15px;
          }
          th {
              background-color: #4CAF50;
              color: white;
          }
          tr:nth-child(even) {
              background-color: #f2f2f2;
          }
          .chart-container {
              height: 400px;
              margin: 20px 0;
          }
          .footer {
              color: #7f8c8d;
              font-size: 0.8em;
              margin-top: 30px;
              text-align: center;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <h1>MySQL Performance Test Results</h1>
          <div class="summary">
              <h2>Summary</h2>
              <p><strong>Total Execution Time:</strong> ${
                  reportData.totalTime
              } ms (${(reportData.totalTime / 1000 / 60).toFixed(
        2
    )} minutes)</p>
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
                  ${reportData.testResults
                      .map(
                          (test) => `
                      <tr>
                          <td>${test.name}</td>
                          <td>${test.time}</td>
                          <td>${(test.time / 1000).toFixed(2)}</td>
                      </tr>
                  `
                      )
                      .join("")}
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
                  labels: ${JSON.stringify(
                      reportData.testResults.map((test) => test.name)
                  )},
                  datasets: [{
                      label: 'Execution Time (ms)',
                      data: ${JSON.stringify(
                          reportData.testResults.map((test) => test.time)
                      )},
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

    fs.writeFileSync("performance_report.html", html);
    console.log("Performance report generated: performance_report.html");
}

runTests();
