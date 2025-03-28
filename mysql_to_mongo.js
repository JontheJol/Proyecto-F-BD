require('dotenv').config();
const Timer = require('./utils/timing');
const { generateData } = require('./utils/data-generator');
const mysqlOps = require('./utils/mysql-operations');
const mongoOps = require('./utils/mongo-operations');

async function main() {
    const timer = new Timer();
    timer.start('total');
    
    try {
        // Setup MySQL database
        await mysqlOps.setupDatabase();
        
        // Generate test data
        timer.start('data_generation');
        const data = generateData(1000);
        timer.end('data_generation');
        console.log("Generated data sample:", data.slice(0, 3));
        
        // Insert data into MySQL
        timer.start('mysql_insert');
        const mysqlSuccess = await mysqlOps.insertData(data);
        timer.end('mysql_insert');
        
        if (mysqlSuccess) {
            // Fetch data from MySQL
            timer.start('mysql_fetch');
            const mysqlData = await mysqlOps.fetchData();
            timer.end('mysql_fetch');
            
            // Insert data into MongoDB
            if (mysqlData.length > 0) {
                timer.start('mongo_insert');
                await mongoOps.insertDocuments(mysqlData);
                timer.end('mongo_insert');
            }
        }
    } catch (error) {
        console.error("Error in migration process:", error);
    } finally {
        timer.end('total');
        console.log("\nPerformance Metrics:");
        console.log(JSON.stringify(timer.getMetrics(), null, 2));
    }
}

main();
