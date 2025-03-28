require('dotenv').config();
const mysql = require('mysql2/promise');
const Timer = require('../utils/timing');

const timer = new Timer();
const config = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'utt',
  database: process.env.MYSQL_DATABASE || 'LibrosAutores'
};

async function createUsers() {
  timer.start('total_user_setup');
  let connection;
  
  try {
    // Connect to database
    connection = await mysql.createConnection({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database
    });
    
    console.log("Connected to MySQL server");
    
    // Drop users if they exist
    timer.start('drop_users');
    try {
      await connection.query(`DROP USER IF EXISTS 'userA'@'localhost'`);
      await connection.query(`DROP USER IF EXISTS 'userB'@'localhost'`);
      await connection.query(`DROP USER IF EXISTS 'userC'@'localhost'`); // For testing permission failures
    } catch (error) {
      // Ignore errors if users don't exist
      console.log("Note: Some users may not have existed");
    }
    timer.end('drop_users');
    
    // Create User A - can create/view books, view authors
    timer.start('create_userA');
    await connection.query(`CREATE USER 'userA'@'localhost' IDENTIFIED BY 'passwordA'`);
    await connection.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${config.database}.Libro TO 'userA'@'localhost'`);
    await connection.query(`GRANT SELECT ON ${config.database}.Autor TO 'userA'@'localhost'`);
    timer.end('create_userA');
    
    // Create User B - can create/view authors, view books
    timer.start('create_userB');
    await connection.query(`CREATE USER 'userB'@'localhost' IDENTIFIED BY 'passwordB'`);
    await connection.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${config.database}.Autor TO 'userB'@'localhost'`);
    await connection.query(`GRANT SELECT ON ${config.database}.Libro TO 'userB'@'localhost'`);
    timer.end('create_userB');
    
    // Create User C - for testing permission failures
    timer.start('create_userC');
    await connection.query(`CREATE USER 'userC'@'localhost' IDENTIFIED BY 'passwordC'`);
    // No permissions given to userC
    timer.end('create_userC');
    
    await connection.query(`FLUSH PRIVILEGES`);
    
    // Test user permissions
    timer.start('test_permissions');
    const results = await testUserPermissions();
    timer.end('test_permissions');
    
    console.log("Users created successfully");
    console.log("Permission test results:", results);
    
  } catch (error) {
    console.error("Error creating users:", error);
  } finally {
    if (connection) {
      await connection.end();
    }
    timer.end('total_user_setup');
    console.log("\nUser Creation Performance:");
    console.log(JSON.stringify(timer.getMetrics(), null, 2));
  }
}

async function testUserPermissions() {
  const results = {
    userA: { libro: null, autor: null },
    userB: { libro: null, autor: null }
  };
  
  // Test User A
  try {
    const connA = await mysql.createConnection({
      host: config.host,
      user: 'userA',
      password: 'passwordA',
      database: config.database
    });
    
    // Test permissions
    try {
      await connA.query('SELECT 1 FROM Libro LIMIT 1');
      results.userA.libro = 'SELECT: OK';
    } catch (e) {
      results.userA.libro = 'SELECT: Failed';
    }
    
    try {
      await connA.query('SELECT 1 FROM Autor LIMIT 1');
      results.userA.autor = 'SELECT: OK';
    } catch (e) {
      results.userA.autor = 'SELECT: Failed';
    }
    
    await connA.end();
  } catch (e) {
    results.userA = `Connection failed: ${e.message}`;
  }
  
  // Test User B
  try {
    const connB = await mysql.createConnection({
      host: config.host,
      user: 'userB',
      password: 'passwordB',
      database: config.database
    });
    
    // Test permissions
    try {
      await connB.query('SELECT 1 FROM Libro LIMIT 1');
      results.userB.libro = 'SELECT: OK';
    } catch (e) {
      results.userB.libro = 'SELECT: Failed';
    }
    
    try {
      await connB.query('SELECT 1 FROM Autor LIMIT 1');
      results.userB.autor = 'SELECT: OK';
    } catch (e) {
      results.userB.autor = 'SELECT: Failed';
    }
    
    await connB.end();
  } catch (e) {
    results.userB = `Connection failed: ${e.message}`;
  }
  
  return results;
}

createUsers();
