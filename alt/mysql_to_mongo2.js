const mysql = require("mysql2/promise");
const Process = require("../utils/Process");
const { MongoClient } = require("mongodb");

const time = {
    mysql: {
        generate: null,
        insert: null,
        export: null,
        import: null,
        select: null,
    },
    mongo: {
        generate: null,
        insert: null,
        import: null,
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
        const x = random_number(1, 100); // Example range for x
        const y = random_number(100, 200); // Example range for y
        const z = random_text(random_number(5, 20)); // Example string

        data.push({ x, y, z });
    }
    const end_time = Date.now();
    console.log(`[mysqlgenerate] Tiempo total: ${end_time - start_time} ms`);
    time.mysql.generate = end_time - start_time;
    return data;
}

async function insertIntoMySQL(data) {
    const start_time = Date.now();
    const connection = await mysql.createConnection({
        host: "localhost",
        user: "root",
        password: "password",
        database: "GenerateDB",
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
        console.log(
            `[mysqlgenerate] Tiempo total: ${end_time - start_time} ms`
        );
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
    const connection = await mysql.createConnection({
        host: "localhost",
        user: "root",
        password: "password",
        database: "GenerateDB",
    });
    console.log("Connected to MySQL!");

    try {
        await connection.execute(`
            SELECT * FROM test
            INTO OUTFILE 'C:/Users/cotto/Documents/tmp/export_mysql_csv.txt'
            FIELDS TERMINATED BY ','
            LINES TERMINATED BY '\\n'
        `);
        console.log("Data inserted successfully!");
        const end_time = Date.now();
        console.log(
            `[mysqlexportcsv] Tiempo total: ${end_time - start_time} ms`
        );
        time.mysql.export = end_time - start_time;
    } catch (err) {
        console.error("MySQL Insert Error:", err);
    } finally {
        await connection.end();
        console.log("MySQL connection closed.");
    }
}

async function exportToMongoDB() {
    const start_time = Date.now();
    const mongoimport = new Process("mongoimport", { shell: true });

    mongoimport.ProcessArguments.push("--db");
    mongoimport.ProcessArguments.push("GenerateDB");
    mongoimport.ProcessArguments.push("--collection");
    mongoimport.ProcessArguments.push("test");
    mongoimport.ProcessArguments.push("--type");
    mongoimport.ProcessArguments.push("csv");
    mongoimport.ProcessArguments.push("--file");
    mongoimport.ProcessArguments.push(
        "C:/Users/cotto/Documents/tmp/export_mysql_csv.txt"
    );
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

(async () => {
    const data = generate_data(1000);
    console.log("Generated Data:", data);

    await insertIntoMySQL(data);
    await exportCsv();

    await exportToMongoDB();

    console.log("Data processed successfully.");
})();
