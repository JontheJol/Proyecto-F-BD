const fs = require('fs');
const path = require('path');

async function exportMongoCollectionsToJson(mongoDb, collections, outputDir = '.') {
  const results = {};
  
  for (const collection of collections) {
    try {
      console.log(`Exporting collection: ${collection}`);
      const documents = await mongoDb.collection(collection).find({}).toArray();
      const outputPath = path.join(outputDir, `${collection}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(documents, null, 2));
      console.log(`Exported ${documents.length} documents to ${outputPath}`);
      results[collection] = { path: outputPath, count: documents.length };
    } catch (error) {
      console.error(`Error exporting collection ${collection}:`, error);
      results[collection] = { error: error.message };
    }
  }
  
  return results;
}

module.exports = {
  exportMongoCollectionsToJson
};
