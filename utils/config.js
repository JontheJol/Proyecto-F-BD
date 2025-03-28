require('dotenv').config();
const path = require('path');
const os = require('os');
const fs = require('fs');

// Create a tmp directory in the user's home folder if it doesn't exist
const tmpDir = path.join(os.homedir(), 'tmp');
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
}

// Build MongoDB URI from components if needed
function buildMongoURI() {
    const baseUri = process.env.MONGO_URI || "mongodb://localhost:27018/GenerateDB";
    
    // If base URI already includes username:password, use it as is
    if (baseUri.includes('@')) {
        return baseUri;
    }
    
    // Otherwise, check if username and password are provided separately
    const user = process.env.MONGO_USER;
    const pass = process.env.MONGO_PASSWORD;
    
    if (user && pass) {
        // Extract host and database from baseUri
        const uriParts = baseUri.match(/mongodb:\/\/([^\/]+)(\/.*)?/);
        if (uriParts) {
            const host = uriParts[1];
            const dbPath = uriParts[2] || '/GenerateDB';
            return `mongodb://${user}:${pass}@${host}${dbPath}`;
        }
    }
    
    // If we get here, return the base URI without auth
    console.log("⚠️ Warning: Using MongoDB without authentication. Check your .env file.");
    return baseUri;
}

module.exports = {
    mysql: {
        host: process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER || 'base',
        password: process.env.MYSQL_PASSWORD || 'utt',
        database: process.env.MYSQL_DATABASE || 'GenerateDB',
        secureFilePath: '/var/lib/mysql-files/' // Add secure file path from verification
    },
    mongo: {
        uri: buildMongoURI(),
        database: process.env.MONGO_DATABASE || process.env.MYSQL_DATABASE || "GenerateDB",
        collection: "test",
        options: {
            // Remove deprecated options that showed warnings
            tlsAllowInvalidCertificates: true,
            tlsAllowInvalidHostnames: true
        }
    },
    paths: {
        tmpDir,
        csvFilePath: path.join(tmpDir, 'export_mysql_csv.txt'),
        dataGeneratedPath: path.join(tmpDir, 'datos_generados.csv')
    }
};
