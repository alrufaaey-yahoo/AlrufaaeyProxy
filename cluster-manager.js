// cluster-manager.js - مدير تجميع العمال
const cluster = require('cluster');
const os = require('os');
const path = require('path');

class ClusterManager {
    constructor(config) {
        this.config = config.clustering;
        this.workers = new Map();
        this.stats = {
            startTime: Date.now(),
            restarts: 0,
            totalWorkers: 0
        };
    }

    start() {
        if (!this.config.enabled) {
            console.log('Clustering disabled, starting single process');
            require('./server.js');
            return;
        }

        if (cluster.isMaster) {
            console.log(`Master process ${process.pid} is running`);
            this.startMaster();
        } else {
            this.startWorker();
        }
    }

    startMaster() {
        const numCPUs = Math.min(os.cpus().length, this.config.workers);
        console.log(`Starting ${numCPUs} worker processes`);
        
        // إنشاء العمال
        for (let i = 0; i < numCPUs; i++) {
            this.forkWorker(i);
        }
        
        // مراقبة العمال
        cluster.on('exit', (worker, code, signal) => {
            console.log(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
            
            if (this.config.autoRestart) {
                console.log('Restarting worker...');
                setTimeout(() => {
                    this.restartWorker(worker.id);
                }, 1000);
            }
        });
        
        // مراقبة استخدام الذاكرة
        setInterval(() => {
            this.checkMemoryUsage();
        }, 30000);
    }

    forkWorker(id) {
        const worker = cluster.fork({
            WORKER_ID: id,
            WORKER_TOTAL: this.config.workers
        });
        
        this.workers.set(worker.id, {
            id,
            pid: worker.process.pid,
            startTime: Date.now(),
            restarts: 0,
            memoryUsage: 0,
            lastHeartbeat: Date.now()
        });
        
        this.stats.totalWorkers++;
        
        worker.on('message', (message) => {
            this.handleWorkerMessage(worker, message);
        });
        
        console.log(`Worker ${id} started with PID ${worker.process.pid}`);
    }

    startWorker() {
        const workerId = process.env.WORKER_ID;
        const workerTotal = process.env.WORKER_TOTAL;
        
        console.log(`Worker ${workerId}/${workerTotal} starting`);
        
        // بدء الخادم في عملية العامل
        require('./worker-server.js');
    }

    handleWorkerMessage(worker, message) {
        const workerInfo = this.workers.get(worker.id);
        if (!workerInfo) return;
        
        switch (message.type) {
            case 'heartbeat':
                workerInfo.lastHeartbeat = Date.now();
                workerInfo.memoryUsage = message.memory || 0;
                break;
                
            case 'stats':
                workerInfo.stats = message.data;
                break;
                
            case 'error':
                console.error(`Worker ${workerInfo.id} error:`, message.error);
                break;
        }
        
        this.workers.set(worker.id, workerInfo);
    }

    checkMemoryUsage() {
        for (const [workerId, info] of this.workers.entries()) {
            if (info.memoryUsage > this.config.memoryLimit * 1024 * 1024) {
                console.warn(`Worker ${info.id} exceeded memory limit: ${Math.round(info.memoryUsage / 1024 / 1024)}MB`);
                
                if (this.config.autoRestart) {
                    this.restartWorker(workerId);
                }
            }
            
            // التحقق من نبضات القلب
            if (Date.now() - info.lastHeartbeat > 30000) {
                console.warn(`Worker ${info.id} heartbeat missing`);
                this.restartWorker(workerId);
            }
        }
    }

    restartWorker(workerId) {
        const workerInfo = this.workers.get(workerId);
        if (!workerInfo) return;
        
        const worker = Object.values(cluster.workers).find(w => w.id === workerId);
        if (worker) {
            worker.kill();
            this.workers.delete(workerId);
            
            setTimeout(() => {
                this.forkWorker(workerInfo.id);
                this.stats.restarts++;
            }, 1000);
        }
    }

    getStats() {
        const now = Date.now();
        const uptime = now - this.stats.startTime;
        
        const workersInfo = Array.from(this.workers.values()).map(info => ({
            id: info.id,
            pid: info.pid,
            uptime: now - info.startTime,
            restarts: info.restarts,
            memoryUsage: Math.round(info.memoryUsage / 1024 / 1024),
            lastHeartbeat: now - info.lastHeartbeat,
            stats: info.stats || {}
        }));
        
        return {
            master: {
                pid: process.pid,
                uptime: Math.floor(uptime / 1000),
                totalWorkers: this.stats.totalWorkers,
                restarts: this.stats.restarts
            },
            workers: workersInfo,
            cpuCount: os.cpus().length,
            totalMemory: Math.round(os.totalmem() / 1024 / 1024),
            freeMemory: Math.round(os.freemem() / 1024 / 1024)
        };
    }
}

module.exports = ClusterManager;
