const { spawn } = require('child_process');

class Process {
    constructor(executable, options = {}) {
        this.executable = executable;
        this.process = null;
        this.process_arguments = [];
        this.options = options;
        this.exit_code = null;
        this.errors = "";
        this.outs = "";
        this.start_time = null;
        this.end_time = null;
        this.finish = false;
    }

    //getters
    get ProcessArguments() {
        return this.process_arguments;
    }

    get Options() {
        return this.options;
    }

    get ExitCode() {
        return this.exit_code;
    }

    get ErrorsLog() {
        return this.errors;
    }

    get Logs() {
        return this.outs;
    }

    get StartTime() {
        return this.start_time;
    }

    get EndTime() {
        return this.end_time;
    }

    //setters
    set ProcessArguments(value) {
        this.process_arguments = value;
    }

    set Options(value) {
        this.options = value;
    }

    async ExecuteAsync(forceTimer = false) {
        return new Promise((resolve, reject) => {
            this.process = spawn(this.executable, this.process_arguments,  this.options);
            if(forceTimer) {
                this.start_time = Date.now();
            }

            this.process.stdout.on("data", (chunk) => {
                this.outs += (chunk.toString());
            });
            
            this.process.stdout.on("error", (err) => {
                const text = err.toString();
                this.errors += text;
                this.outs += text;
            });

            this.process.on('close', (code) => {
                this.exit_code = code.toString();
                this.outs += code.toString();
                this.end_time = Date.now();
                resolve(true);
            });
            
            this.process.on("error", (err) => {
                const text = err.toString();
                this.errors += text;
                this.outs += text;
            });
            
            this.process.stderr.on("data", (chunk) => {
                const text = chunk.toString();
                this.errors += text;
                this.outs += text;
            });
            
            this.process.stderr.on("error", (error) => {
                const text = error.toString();
                this.errors += text;
                this.outs += text;
            });
        });
    }

    Execute(forceTimer = false) {
        this.process = spawn(this.executable, this.process_arguments,  this.options);
        if(forceTimer) {
            this.start_time = Date.now();
        }

        this.process.stdout.on("data", (chunk) => {
            this.outs += (chunk.toString());
        });
        
        this.process.stdout.on("error", (err) => {
            const text = err.toString();
            this.errors += text;
            this.outs += text;
        });

        this.process.on('close', (code) => {
            this.exit_code = code.toString();
            this.outs += code.toString();
            this.end_time = Date.now();
            this.finish = true;
        });
        
        this.process.on("error", (err) => {
            const text = err.toString();
            this.errors += text;
            this.outs += text;
        });
        
        this.process.stderr.on("data", (chunk) => {
            const text = chunk.toString();
            this.errors += text;
            this.outs += text;
        });
        
        this.process.stderr.on("error", (error) => {
            const text = error.toString();
            this.errors += text;
            this.outs += text;
        });
    }

    Write(cmd) {
        if(this.start_time === null) {
            this.start_time = Date.now();
        }

        this.process.stdin.write(cmd);
    }
    
    End() {
        this.process.stdin.end();
    }

    async Finish() {
        const self = this;
        return new Promise((resolve, reject) => {
            const loop = setInterval(() => {
                if(self.finish === true) {
                    clearInterval(loop);
                    resolve(true);
                }
            }, 100);
        });
    }
}

module.exports = Process;