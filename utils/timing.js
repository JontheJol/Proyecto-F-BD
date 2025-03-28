class Timer {
    constructor() {
        this.metrics = {};
    }

    start(label) {
        if (!label) throw new Error('Timer label is required');
        this.metrics[label] = { 
            startTime: Date.now(),
            endTime: null,
            duration: null
        };
        return this;
    }

    end(label) {
        if (!label || !this.metrics[label]) {
            throw new Error(`Timer with label "${label}" not found or not started`);
        }
        
        const timer = this.metrics[label];
        timer.endTime = Date.now();
        timer.duration = timer.endTime - timer.startTime;
        
        console.log(`[${label}] Completed in ${timer.duration} ms`);
        return timer.duration;
    }

    getMetrics() {
        return this.metrics;
    }

    getDuration(label) {
        return this.metrics[label]?.duration;
    }

    reset() {
        this.metrics = {};
        return this;
    }
}

module.exports = Timer;
