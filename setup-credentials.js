require('dotenv').config();
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

async function main() {
    console.log('🔐 Database Connection Setup');
    console.log('============================');
    console.log('Let\'s verify your database connections...');

    const envPath = path.join(__dirname, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

    // ===== MySQL Setup =====
    console.log('\n📊 MySQL Connection Test');
    let mysqlSuccess = false;
    let mysqlAttempts = 0;
    
    while (!mysqlSuccess && mysqlAttempts < 3) {
        mysqlAttempts++;
        
        const mysqlUser = process.env.MYSQL_USER || await question('MySQL Username (default: base): ') || 'base';
        const mysqlPassword = process.env.MYSQL_PASSWORD || await question('MySQL Password: ');
        const mysqlHost = process.env.MYSQL_HOST || await question('MySQL Host (default: localhost): ') || 'localhost';
        
        try {
            console.log(`Attempting to connect to MySQL as ${mysqlUser}@${mysqlHost}...`);
            const connection = await mysql.createConnection({
                host: mysqlHost,
                user: mysqlUser,
                password: mysqlPassword
            });
            
            console.log('✅ MySQL connection successful!');
            
            // Update .env file
            if (envContent.includes('MYSQL_HOST=')) {
                envContent = envContent.replace(/MYSQL_HOST=.*/, `MYSQL_HOST=${mysqlHost}`);
            } else {
                envContent += `\nMYSQL_HOST=${mysqlHost}`;
            }
            
            if (envContent.includes('MYSQL_USER=')) {
                envContent = envContent.replace(/MYSQL_USER=.*/, `MYSQL_USER=${mysqlUser}`);
            } else {
                envContent += `\nMYSQL_USER=${mysqlUser}`;
            }
            
            if (envContent.includes('MYSQL_PASSWORD=')) {
                envContent = envContent.replace(/MYSQL_PASSWORD=.*/, `MYSQL_PASSWORD=${mysqlPassword}`);
            } else {
                envContent += `\nMYSQL_PASSWORD=${mysqlPassword}`;
            }
            
            await connection.end();
            mysqlSuccess = true;
            
        } catch (error) {
            console.error(`❌ MySQL connection failed: ${error.message}`);
            console.log('Please try again or press Ctrl+C to exit');
        }
    }
    
    // ===== MongoDB Setup =====
    console.log('\n🍃 MongoDB Connection Test');
    let mongoSuccess = false;
    let mongoAttempts = 0;
    
    while (!mongoSuccess && mongoAttempts < 3) {
        mongoAttempts++;
        
        console.log('MongoDB connection options:');
        console.log('1. Connection string (mongodb://[username:password@]host:port/database)');
        console.log('2. Individual components');
        const option = await question('Select option (1/2): ');
        
        let mongoUri;
        
        if (option === '1') {
            mongoUri = await question('MongoDB Connection String: ');
        } else {
            const mongoHost = await question('MongoDB Host (default: localhost): ') || 'localhost';
            const mongoPort = await question('MongoDB Port (default: 27017): ') || '27017';
            const mongoUser = await question('MongoDB Username (optional): ');
            const mongoPassword = mongoUser ? await question('MongoDB Password: ') : '';
            const mongoDatabase = await question('MongoDB Database (default: LibrosAutores): ') || 'LibrosAutores';
            
            if (mongoUser && mongoPassword) {
                mongoUri = `mongodb://${mongoUser}:${mongoPassword}@${mongoHost}:${mongoPort}/${mongoDatabase}`;
            } else {
                mongoUri = `mongodb://${mongoHost}:${mongoPort}/${mongoDatabase}`;
            }
            
            // Save individual components
            if (mongoUser) {
                if (envContent.includes('MONGO_USER=')) {
                    envContent = envContent.replace(/MONGO_USER=.*/, `MONGO_USER=${mongoUser}`);
                } else {
                    envContent += `\nMONGO_USER=${mongoUser}`;
                }
            }
            
            if (mongoPassword) {
                if (envContent.includes('MONGO_PASSWORD=')) {
                    envContent = envContent.replace(/MONGO_PASSWORD=.*/, `MONGO_PASSWORD=${mongoPassword}`);
                } else {
                    envContent += `\nMONGO_PASSWORD=${mongoPassword}`;
                }
            }
        }
        
        try {
            console.log(`Attempting to connect to MongoDB at ${mongoUri}...`);
            const client = new MongoClient(mongoUri, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 5000,
                // For local development, we might need to disable SSL requirements
                tlsAllowInvalidCertificates: true,
                tlsAllowInvalidHostnames: true
            });
            
            await client.connect();
            console.log('✅ MongoDB connection successful!');
            await client.close();
            
            // Update .env file with the connection string
            if (envContent.includes('MONGO_URI=')) {
                envContent = envContent.replace(/MONGO_URI=.*/, `MONGO_URI=${mongoUri}`);
            } else {
                envContent += `\nMONGO_URI=${mongoUri}`;
            }
            
            mongoSuccess = true;
        } catch (error) {
            console.error(`❌ MongoDB connection failed: ${error.message}`);
            console.log('Please try again or press Ctrl+C to exit');
        }
    }
    
    // Save the updated .env file
    if (mysqlSuccess || mongoSuccess) {
        fs.writeFileSync(envPath, envContent);
        console.log('\n✅ Credentials updated in .env file');
    }
    
    if (!mysqlSuccess) {
        console.warn('⚠️ MySQL connection was not configured successfully');
    }
    
    if (!mongoSuccess) {
        console.warn('⚠️ MongoDB connection was not configured successfully');
    }
    
    console.log('\nSetup complete! You can now run your application.');
    rl.close();
}

main().catch(console.error);
