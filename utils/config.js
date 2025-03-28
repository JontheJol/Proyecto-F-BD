require('dotenv').config();
const path = require('path');
const os = require('os');
const fs = require('fs');

// Create a tmp directory in the user's home folder if it doesn't exist
const tmpDir = path.join(os.homedir(), 'tmp');
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
}

module.exports = {
    mysql: {
        host: process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || 'utt',
        database: process.env.MYSQL_DATABASE || 'GenerateDB',
    },
    mongo: {
        uri: process.env.MONGO_URI || "mongodb://localhost:27017",
        database: process.env.MONGO_DATABASE || "GenerateDB",
        collection: "test"
    },
    paths: {
        tmpDir,
        csvFilePath: path.join(tmpDir, 'export_mysql_csv.txt'),
        dataGeneratedPath: path.join(tmpDir, 'datos_generados.csv')
    }
};
