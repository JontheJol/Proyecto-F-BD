require('dotenv').config();
const Process = require('./utils/Process');
const fs = require('fs');
const Timer = require('./utils/timing');
const config = require('./utils/config');
const mysql = require('mysql2/promise');

const timer = new Timer();

// Function to connect to MySQL using the config module
async function connectToMySQL() {
  return await mysql.createConnection({
    host: config.mysql.host,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database
  });
}

(async () => {
    // Start timing overall process
    timer.start('total');
    
    // Export MySQL database to file
    timer.start('mysql_export');
    const mysqldump = new Process("mysqldump");
    mysqldump.ProcessArguments.push(`-h${config.mysql.host}`);
    mysqldump.ProcessArguments.push(`-u${config.mysql.user}`);
    mysqldump.ProcessArguments.push(`--password=${config.mysql.password}`);
    mysqldump.ProcessArguments.push(config.mysql.database);
    mysqldump.ProcessArguments.push("--result-file=alumnos.sql");
    await mysqldump.ExecuteAsync(true);
    timer.end('mysql_export');

    // Drop MySQL database
    timer.start('mysql_drop');
    const dropMysql = new Process("mysql"); 
    dropMysql.ProcessArguments.push(`-h${config.mysql.host}`);
    dropMysql.ProcessArguments.push(`-u${config.mysql.user}`);
    dropMysql.ProcessArguments.push(`--password=${config.mysql.password}`);
    dropMysql.Execute();
    dropMysql.Write(`drop database ${config.mysql.database};`);
    dropMysql.Write(`create database ${config.mysql.database};`);
    dropMysql.End();
    await dropMysql.Finish();
    timer.end('mysql_drop');

    // Import MySQL database from file
    timer.start('mysql_import');
    const mysql_import = new Process("mysql", {
        shell: true
    });
    mysql_import.ProcessArguments.push(`-h${config.mysql.host}`);
    mysql_import.ProcessArguments.push(`-u${config.mysql.user}`);
    mysql_import.ProcessArguments.push(`--password=${config.mysql.password}`);
    mysql_import.ProcessArguments.push(` ${config.mysql.database} < alumnos.sql`);
    await mysql_import.ExecuteAsync(true);
    timer.end('mysql_import');

    /*********************Mongo*************************/
    // Export MongoDB collection
    timer.start('mongo_export');
    const mongoexport = new Process("mongoexport");
    mongoexport.ProcessArguments.push("--collection=Alumno");
    mongoexport.ProcessArguments.push(`--db=${config.mongo.database}`);
    mongoexport.ProcessArguments.push("--out=alumnos.json");
    await mongoexport.ExecuteAsync(true);
    timer.end('mongo_export');

    // Drop MongoDB collection
    timer.start('mongo_drop');
    const dropMongo = new Process("mongosh"); 
    dropMongo.Execute();
    dropMongo.Write(`use ${config.mongo.database};`);
    dropMongo.Write("\n");
    dropMongo.Write("db.Alumno.drop();");
    dropMongo.End();
    await dropMongo.Finish();
    timer.end('mongo_drop');

    // Import MongoDB collection from file
    timer.start('mongo_import');
    const mongoimport = new Process("mongoimport");
    mongoimport.ProcessArguments.push("--collection=Alumno");
    mongoimport.ProcessArguments.push(`--db=${config.mongo.database}`);
    mongoimport.ProcessArguments.push("alumnos.json");
    await mongoimport.ExecuteAsync(true);
    timer.end('mongo_import');

    timer.end('total');

    // Extract metrics from timer
    const metricas = {
        mysql: {
            export: timer.getDuration('mysql_export'),
            drop: timer.getDuration('mysql_drop'),
            import: timer.getDuration('mysql_import')
        },
        mongo: {
            export: timer.getDuration('mongo_export'),
            drop: timer.getDuration('mongo_drop'),
            import: timer.getDuration('mongo_import')
        },
        total: timer.getDuration('total')
    };

    //Imprimir métricas
    console.log("Performance Metrics:");
    console.log(JSON.stringify(metricas, null, 2));
    
    generarReporte(metricas);
})();

function generarReporte(metricas) {
    const grafico_mysql = {
        type: "bar",
        labels: `['Export', 'Drop', 'Import']`,
        data: `[${metricas.mysql.export}, ${metricas.mysql.drop}, ${metricas.mysql.import}]`,
        title: "Pruebas de rendimiento de MySQL"
    }

    const grafico_mongo = {
        type: "bar",
        labels: `['Export', 'Drop', 'Import']`,
        data: `[${metricas.mongo.export}, ${metricas.mongo.drop}, ${metricas.mongo.import}]`,
        title: "Pruebas de rendimiento de Mongo"
    }

    // Add comparison chart
    const grafico_comparacion = {
        type: "bar",
        labels: `['Export', 'Drop', 'Import']`,
        data1: `[${metricas.mysql.export}, ${metricas.mysql.drop}, ${metricas.mysql.import}]`,
        data2: `[${metricas.mongo.export}, ${metricas.mongo.drop}, ${metricas.mongo.import}]`,
        title: "MySQL vs MongoDB Performance"
    }

    const reporte = 
    `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <title>Métricas de BDD</title>
        <style>
            .chart-container {
                width: 80%;
                margin: 20px auto;
                padding: 20px;
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            }
            h2 {
                text-align: center;
                margin-bottom: 20px;
            }
            .summary {
                margin: 20px auto;
                width: 80%;
                padding: 15px;
                background-color: #f8f9fa;
                border-radius: 5px;
            }
            .footer {
                text-align: center;
                margin-top: 30px;
                font-size: 0.9em;
                color: #6c757d;
            }
        </style>
    </head>
    <body>
        <div class="summary">
            <h2>Database Performance Summary</h2>
            <p><strong>Total Execution Time:</strong> ${metricas.total} ms</p>
            <p><strong>MySQL Total:</strong> ${metricas.mysql.export + metricas.mysql.drop + metricas.mysql.import} ms</p>
            <p><strong>MongoDB Total:</strong> ${metricas.mongo.export + metricas.mongo.drop + metricas.mongo.import} ms</p>
        </div>
        
        <div class="chart-container">
            <h2>MySQL Performance</h2>
            <canvas id="grafico-mysql"></canvas>
        </div>
        
        <div class="chart-container">
            <h2>MongoDB Performance</h2>
            <canvas id="grafico-mongo"></canvas>
        </div>
        
        <div class="chart-container">
            <h2>Comparison: MySQL vs MongoDB</h2>
            <canvas id="grafico-comparacion"></canvas>
        </div>

        <div class="footer">
            <p>Generated on: ${new Date().toLocaleString()}</p>
        </div>

        <script>
            const mysql = document.getElementById('grafico-mysql');
            const mongo = document.getElementById('grafico-mongo');
            const comparacion = document.getElementById('grafico-comparacion');

            new Chart(mysql, {
                type: '${grafico_mysql.type}',
                data: {
                    labels: ${grafico_mysql.labels},
                    datasets: [{
                        label: '${grafico_mysql.title}',
                        data: ${grafico_mysql.data},
                        backgroundColor: 'rgba(54, 162, 235, 0.6)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });

            new Chart(mongo, {
                type: '${grafico_mongo.type}',
                data: {
                    labels: ${grafico_mongo.labels},
                    datasets: [{
                        label: '${grafico_mongo.title}',
                        data: ${grafico_mongo.data},
                        backgroundColor: 'rgba(255, 99, 132, 0.6)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
            
            new Chart(comparacion, {
                type: '${grafico_comparacion.type}',
                data: {
                    labels: ${grafico_comparacion.labels},
                    datasets: [
                        {
                            label: 'MySQL',
                            data: ${grafico_comparacion.data1},
                            backgroundColor: 'rgba(54, 162, 235, 0.6)',
                            borderColor: 'rgba(54, 162, 235, 1)',
                            borderWidth: 1
                        },
                        {
                            label: 'MongoDB',
                            data: ${grafico_comparacion.data2},
                            backgroundColor: 'rgba(255, 99, 132, 0.6)',
                            borderColor: 'rgba(255, 99, 132, 1)',
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        </script>
    </body>
    </html>
    `;

    fs.writeFileSync("reporte.html", reporte);
    console.log("Performance report generated: reporte.html");
}