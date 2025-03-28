const { spawn } = require('child_process');

class Process {
    constructor(command, options = {}) {
        this.command = command;
        this.options = options;
        this.ProcessArguments = [];
        this.process = null;
        this.stdout = [];
        this.stderr = [];
    }
    
    Execute() {
        this.process = spawn(this.command, this.ProcessArguments, this.options);
        
        this.process.stdout.on('data', (data) => {
            const text = data.toString();
            this.stdout.push(text);
            if (!this.options.silent) {
                process.stdout.write(text);
            }
        });
        
        this.process.stderr.on('data', (data) => {
            const text = data.toString();
            this.stderr.push(text);
            if (!this.options.silent) {
                process.stderr.write(text);
            }
        });
        
        return this.process;
    }
    
    Write(data) {
        if (this.process && this.process.stdin) {
            this.process.stdin.write(data);
        }
    }
    
    End() {
        if (this.process && this.process.stdin) {
            this.process.stdin.end();
        }
    }
    
    async ExecuteAsync(waitForExit = false) {
        this.Execute();
        
        if (waitForExit) {
            return this.Finish();
        }
    }
    
    Finish() {
        return new Promise((resolve, reject) => {
            if (!this.process) {
                reject(new Error('Process not started'));
                return;
            }
            
            this.process.on('close', (code) => {
                if (code === 0) {
                    resolve({
                        stdout: this.stdout.join(''),
                        stderr: this.stderr.join('')
                    });
                } else {
                    reject(new Error(`Process exited with code ${code}. Error: ${this.stderr.join('')}`));
                }
            });
            
            this.process.on('error', (err) => {
                reject(new Error(`Process error: ${err.message}`));
            });
        });
    }
}

module.exports = Process;