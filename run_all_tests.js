require('dotenv').config();
const { spawnSync } = require('child_process');
const fs = require('fs');

console.log('🚀 Starting Database Project Tests');

const steps = [
  {
    name: '1️⃣ Creating Database Schema',
    command: 'node',
    args: ['./scripts/create_schema.js']
  },
  {
    name: '2️⃣ Setting Up Database Users',
    command: 'node',
    args: ['./scripts/create_users.js']
  },
  {
    name: '3️⃣ Running Performance Tests',
    command: 'node',
    args: ['./performance-test.js']
  },
  {
    name: '4️⃣ Running MongoDB Million Records Test',
    command: 'node',
    args: ['./mongo-million-records.js']
  }
];

async function runTests() {
  const startTime = Date.now();
  
  for (const step of steps) {
    console.log(`\n\n${step.name}`);
    console.log('==================================================');
    
    const result = spawnSync(step.command, step.args, { 
      stdio: 'inherit',
      env: process.env
    });
    
    if (result.status !== 0) {
      console.error(`❌ ${step.name} failed with exit code ${result.status}`);
      process.exit(result.status);
    }
  }
  
  const endTime = Date.now();
  const totalTimeMs = endTime - startTime;
  const totalTimeMin = (totalTimeMs / 1000 / 60).toFixed(2);
  
  console.log('\n\n🏁 All tests completed successfully!');
  console.log(`⏱️ Total execution time: ${totalTimeMs} ms (${totalTimeMin} minutes)`);
  
  // Generate final report
  generateFinalReport(totalTimeMs);
}

function generateFinalReport(totalTimeMs) {
  const reports = [];
  
  // Check if performance report exists
  if (fs.existsSync('performance_report.html')) {
    reports.push({
      name: 'MySQL Performance Tests',
      path: 'performance_report.html'
    });
  }
  
  const reportHtml = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Database Project Final Report</title>
      <style>
          body {
              font-family: Arial, sans-serif;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
          }
          header {
              text-align: center;
              margin-bottom: 30px;
          }
          .summary {
              background-color: #f8f9fa;
              padding: 20px;
              border-radius: 5px;
              margin-bottom: 30px;
          }
          .report-links {
              margin-top: 20px;
          }
          .report-link {
              display: block;
              margin-bottom: 10px;
              padding: 10px;
              background-color: #e9ecef;
              border-radius: 5px;
              text-decoration: none;
              color: #495057;
          }
          .report-link:hover {
              background-color: #dee2e6;
          }
          footer {
              margin-top: 30px;
              text-align: center;
              color: #6c757d;
              font-size: 0.9em;
          }
      </style>
  </head>
  <body>
      <header>
          <h1>Database Project Final Report</h1>
          <p>MySQL and MongoDB Performance Analysis</p>
      </header>
      
      <div class="summary">
          <h2>Project Summary</h2>
          <p>This project tested the performance of MySQL and MongoDB for various database operations including:</p>
          <ul>
              <li>Data generation and insertion</li>
              <li>CSV import/export</li>
              <li>Complex queries</li>
              <li>Database backup and restoration</li>
              <li>Migration between database systems</li>
          </ul>
          <p><strong>Total Execution Time:</strong> ${totalTimeMs} ms (${(totalTimeMs / 1000 / 60).toFixed(2)} minutes)</p>
      </div>
      
      <h2>Detailed Reports</h2>
      <div class="report-links">
          ${reports.map(report => `
              <a href="${report.path}" class="report-link">
                  <h3>${report.name}</h3>
                  <p>Click to view detailed performance metrics</p>
              </a>
          `).join('')}
      </div>
      
      <footer>
          <p>Generated on ${new Date().toLocaleString()}</p>
      </footer>
  </body>
  </html>
  `;
  
  fs.writeFileSync('final_report.html', reportHtml);
  console.log('📊 Final report generated: final_report.html');
}

runTests();
