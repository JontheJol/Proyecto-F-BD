const { MongoClient } = require('mongodb');
const Process = require('./Process');
const config = require('./config');

async function insertDocuments(data) {
    const client = new MongoClient(config.mongo.uri, config.mongo.options);

    try {
        await client.connect();
        console.log("Connected to MongoDB for data insertion");
        
        const database = client.db(config.mongo.database);
        const collection = database.collection(config.mongo.collection);
        
        const result = await collection.insertMany(data);
        
        console.log(`${result.insertedCount} documents inserted into MongoDB`);
        return result.insertedCount;
    } catch (error) {
        console.error("MongoDB insert error:", error);
        console.error("Connection URI (redacted password):", maskPassword(config.mongo.uri));
        return 0;
    } finally {
        await client.close();
    }
}

async function importCsv(csvFilePath = config.paths.csvFilePath) {
    // Build MongoDB connection string for the CLI tool
    let mongoImportUri = config.mongo.uri;
    
    // Extract credentials if present in URI
    const mongoUriMatch = mongoImportUri.match(/mongodb:\/\/([^:]+):([^@]+)@(.+)/);
    let authArgs = [];
    
    if (mongoUriMatch) {
        // Use --username and --password args instead of URI with credentials
        const username = mongoUriMatch[1];
        const password = mongoUriMatch[2];
        // Reconstruct URI without credentials
        mongoImportUri = `mongodb://${mongoUriMatch[3]}`;
        authArgs = ["--username", username, "--password", password];
    }

    const mongoimport = new Process("mongoimport", { shell: true });
    
    mongoimport.ProcessArguments.push("--uri");
    mongoimport.ProcessArguments.push(mongoImportUri);
    mongoimport.ProcessArguments.push(...authArgs);
    mongoimport.ProcessArguments.push("--db");
    mongoimport.ProcessArguments.push(config.mongo.database);
    mongoimport.ProcessArguments.push("--collection");
    mongoimport.ProcessArguments.push(config.mongo.collection);
    mongoimport.ProcessArguments.push("--type");
    mongoimport.ProcessArguments.push("csv");
    mongoimport.ProcessArguments.push("--file");
    mongoimport.ProcessArguments.push(csvFilePath);
    mongoimport.ProcessArguments.push("--fields");
    mongoimport.ProcessArguments.push("x,y,z");

    console.log(`Running: mongoimport ${mongoimport.ProcessArguments.join(' ')}`);
    mongoimport.Execute();

    try {
        await mongoimport.Finish();
        console.log("Data imported to MongoDB successfully from CSV");
        return true;
    } catch (error) {
        console.error("MongoDB CSV import error:", error);
        return false;
    }
}

// Helper function to mask password in connection string for logs
function maskPassword(uri) {
    if (typeof uri !== 'string') return 'invalid-uri';
    return uri.replace(/\/\/([^:]+):([^@]+)@/, '//\\1:***@');
}

module.exports = {
    insertDocuments,
    importCsv
};
