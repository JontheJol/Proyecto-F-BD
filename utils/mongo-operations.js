const { MongoClient } = require('mongodb');
const Process = require('./Process');
const config = require('./config');

async function insertDocuments(data) {
    const client = new MongoClient(config.mongo.uri);

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
        return 0;
    } finally {
        await client.close();
    }
}

async function importCsv(csvFilePath = config.paths.csvFilePath) {
    const mongoimport = new Process("mongoimport", { shell: true });

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

module.exports = {
    insertDocuments,
    importCsv
};
