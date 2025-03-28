require("dotenv").config();
const mysql = require("mysql2/promise");
const Process = require("./utils/Process");
const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Create a tmp directory in the user's home folder if it doesn't exist
const tmpDir = path.join(os.homedir(), "tmp");
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
}

// Files paths based on OS
const csvFilePath = path.join(tmpDir, "export_mysql_csv.txt");
const dataGeneratedPath = path.join(tmpDir, "datos_generados.csv");

const time = {
    mysql: {
        generate: null,
        insertcsv: null,
        insert: null,
        generate100: null,
        insert100: null,
        select: null,
        generateAutores: null,
        export: null,
        respaldo: null,
        dump: null,
        importsnap: null,
        insertUserAutor: null,
        insertUserLibro: null,
    },
    mongo: {
        generate: null,
        export: null,
        importMySQL: null,
    },
};

function random_number(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function random_text(characters_num) {
    let text = "";
    for (let i = 0; i < characters_num; i++) {
        const letra = String.fromCharCode(random_number(65, 89));
        text += letra;
    }
    return text;
}

function generate_data(size) {
    const start_time = Date.now();
    let data = [];
    for (let i = 0; i < size; i++) {
        const x = random_number(1, 100);
        const y = random_number(100, 200);
        const z = random_text(random_number(5, 20));

        data.push({ x, y, z });
    }
    const end_time = Date.now();
    console.log(`[generate_data] Tiempo total: ${end_time - start_time} ms`);
    time.mysql.generate = end_time - start_time;
    return data;
}

async function setupMySQL() {
    const host = process.env.MYSQL_HOST || "localhost";
    const user = process.env.MYSQL_USER || "root";
    const password = process.env.MYSQL_PASSWORD || "utt";
    const database = process.env.MYSQL_DATABASE || "Proyecto";

    try {
        const connection = await mysql.createConnection({
            host,
            user,
            password,
        });

        await connection.query(`CREATE DATABASE IF NOT EXISTS ${database}`);
        await connection.query(`USE ${database}`);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS Libro (id INT, ISBN VARCHAR(16) NOT NULL, title VARCHAR(512) NOT NULL, autor_license VARCHAR(12), FOREIGN KEY (autor_license) REFERENCES Autor(license), editorial TINYTEXT, pages SMALLINT, year SMALLINT NOT NULL, genre TINYTEXT, language TINYTEXT NOT NULL, format TINYTEXT, sinopsis TEXT, content TEXT);
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS Autor (id INT, license VARCHAR(12) NOT NULL, name TINYTEXT NOT NULL, lastName TINYTEXT, secondLastName TINYTEXT, year SMALLINT);
        `);

        await connection.end();
        console.log("MySQL setup completed successfully");
    } catch (error) {
        console.error("Error setting up MySQL:", error);
        throw error;
    }
}

async function insertIntoMySQL(data) {
    const start_time = Date.now();
    const host = process.env.MYSQL_HOST || "localhost";
    const user = process.env.MYSQL_USER || "root";
    const password = process.env.MYSQL_PASSWORD || "utt";
    const database = process.env.MYSQL_DATABASE || "GenerateDB";

    const connection = await mysql.createConnection({
        host,
        user,
        password,
        database,
    });
    console.log("Connected to MySQL!");

    try {
        await Promise.all(
            data.map((row) =>
                connection.execute(
                    "INSERT INTO test (x, y, z) VALUES (?, ?, ?)",
                    [row.x, row.y, row.z]
                )
            )
        );
        console.log("Data inserted successfully!");
        const end_time = Date.now();
        console.log(`[mysqlinsert] Tiempo total: ${end_time - start_time} ms`);
        time.mysql.insert = end_time - start_time;
    } catch (err) {
        console.error("MySQL Insert Error:", err);
    } finally {
        await connection.end();
        console.log("MySQL connection closed.");
    }
}

async function exportCsv() {
    const start_time = Date.now();
    const host = process.env.MYSQL_HOST || "localhost";
    const user = process.env.MYSQL_USER || "root";
    const password = process.env.MYSQL_PASSWORD || "utt";
    const database = process.env.MYSQL_DATABASE || "GenerateDB";

    // For MySQL to be able to write to the file, we need to adjust the approach based on OS
    const isWindows = os.platform() === "win32";

    if (isWindows) {
        // Windows approach - using MySQL's INTO OUTFILE
        const connection = await mysql.createConnection({
            host,
            user,
            password,
            database,
        });
        console.log("Connected to MySQL!");

        try {
            await connection.execute(`
                SELECT * FROM test
                INTO OUTFILE '${csvFilePath.replace(/\\/g, "/")}'
                FIELDS TERMINATED BY ','
                LINES TERMINATED BY '\\n'
            `);
            console.log("Data exported successfully!");
        } catch (err) {
            console.error("MySQL Export Error:", err);
        } finally {
            await connection.end();
            console.log("MySQL connection closed.");
        }
    } else {
        // Linux approach - using separate query and file writing
        const connection = await mysql.createConnection({
            host,
            user,
            password,
            database,
        });
        console.log("Connected to MySQL!");

        try {
            const [rows] = await connection.execute("SELECT * FROM test");
            const csvContent = rows
                .map((row) => `${row.x},${row.y},${row.z}`)
                .join("\n");
            fs.writeFileSync(csvFilePath, csvContent);
            console.log("Data exported successfully!");
        } catch (err) {
            console.error("MySQL Export Error:", err);
        } finally {
            await connection.end();
            console.log("MySQL connection closed.");
        }
    }

    const end_time = Date.now();
    console.log(`[mysqlexportcsv] Tiempo total: ${end_time - start_time} ms`);
    time.mysql.export = end_time - start_time;
}

async function exportToMongoDB() {
    const start_time = Date.now();
    const mongoimport = new Process("mongoimport", { shell: true });

    mongoimport.ProcessArguments.push("--db");
    mongoimport.ProcessArguments.push(
        process.env.MYSQL_DATABASE || "GenerateDB"
    );
    mongoimport.ProcessArguments.push("--collection");
    mongoimport.ProcessArguments.push("test");
    mongoimport.ProcessArguments.push("--type");
    mongoimport.ProcessArguments.push("csv");
    mongoimport.ProcessArguments.push("--file");
    mongoimport.ProcessArguments.push(csvFilePath);
    mongoimport.ProcessArguments.push("--fields");
    mongoimport.ProcessArguments.push("x,y,z");

    mongoimport.Execute();

    try {
        await mongoimport.Finish();
        console.log("Data imported to MongoDB successfully!");
        const end_time = Date.now();
        console.log(`[mongoImport] Tiempo total: ${end_time - start_time} ms`);
        time.mongo.import = end_time - start_time;
    } catch (err) {
        console.error("MongoDB Import Error:", err);
    }
}

async function main() {
    try {
        await setupMySQL();
        const data = generate_data(1000);
        console.log("Generated Data Sample:", data.slice(0, 3));

        await insertIntoMySQL(data);
        await exportCsv();
        await exportToMongoDB();

        console.log("Full metrics:");
        console.log(time);
    } catch (error) {
        console.error("Error in main process:", error);
    }
}

main();
