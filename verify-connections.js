require('dotenv').config();
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');
const config = require('./utils/config');

async function main() {
  console.log('🔍 Verifying Database Connections');
  console.log('================================');
  
  // Check MySQL connection
  console.log('\n📊 Checking MySQL Connection');
  try {
    console.log(`Connecting to MySQL at ${config.mysql.host} as user ${config.mysql.user}...`);
    const connection = await mysql.createConnection({
      host: config.mysql.host,
      user: config.mysql.user,
      password: config.mysql.password
    });
    
    console.log('✅ MySQL connection successful!');
    
    // Check if we can create a test database
    console.log('Testing database creation privileges...');
    try {
      await connection.query('CREATE DATABASE IF NOT EXISTS test_permissions');
      await connection.query('DROP DATABASE test_permissions');
      console.log('✅ User has database creation privileges');
    } catch (err) {
      console.log('❌ User cannot create databases. Specific privileges may be required.');
    }
    
    // Check secure_file_priv setting
    console.log('Checking secure_file_priv setting...');
    const [secureFilePriv] = await connection.query("SHOW VARIABLES LIKE 'secure_file_priv'");
    
    if (secureFilePriv[0].Value) {
      console.log(`⚠️ secure_file_priv is set to: ${secureFilePriv[0].Value}`);
      console.log('This restricts where MySQL can read files from. The application will use a different approach.');
    } else {
      console.log('✅ secure_file_priv is not set. Direct file operations are allowed.');
    }
    
    await connection.end();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
  }
  
  // Check MongoDB connection
  console.log('\n🍃 Checking MongoDB Connection');
  try {
    console.log(`Connecting to MongoDB using: ${maskPassword(config.mongo.uri)}...`);
    const client = new MongoClient(config.mongo.uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      ...config.mongo.options
    });
    
    await client.connect();
    console.log('✅ MongoDB connection successful!');
    
    // Check if we can create a collection
    console.log('Testing collection creation...');
    const db = client.db(config.mongo.database);
    try {
      await db.createCollection('test_collection');
      await db.collection('test_collection').drop();
      console.log('✅ Can create and drop collections');
    } catch (err) {
      console.log('❌ Cannot create collections. Check permissions.');
    }
    
    await client.close();
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    console.log('\nTry running: node setup-credentials.js');
  }
  
  console.log('\n🔄 Connection verification complete!');
}

function maskPassword(uri) {
  if (typeof uri !== 'string') return uri;
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//\\1:***@');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });
