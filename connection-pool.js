// connection-pool.js - تجمع الاتصالات المتقدم
const net = require('net');
const EventEmitter = require('events');

class ConnectionPool extends EventEmitter {
    constructor(config, proxyManager, splitter) {
        super();
        this.config = config;
        this.proxyManager = proxyManager;
        this.splitter = splitter;
        
        this.pool = new Map(); // sessionId -> connection info
        this.workerConnections = new Map(); // workerId -> connections
        this.connectionStats = {
            totalConnections: 0,
            activeConnections: 0,
            failedConnections: 0,
            bytesTransferred: 0,
            startTime: Date.now()
        };
        
        // تهيئة عمال الاتصال (32 عامل)
        this.workers = Array.from({ length: 32 }, (_, i) => ({
            id: i,
            connections: new Set(),
            bytesTransferred: 0,
            lastActivity: Date.now()
        }));
        
        // جدول توزيع الاتصالات
        this.distributionTable = new Array(32).fill(0);
    }

    assignToWorker(sessionId) {
        // خوارزمية توزيع متوازنة
        const workerId = this.distributionTable.indexOf(Math.min(...this.distributionTable));
        this.distributionTable[workerId]++;
        
        // إعادة ضبط إذا وصل إلى الحد الأقصى
        if (Math.max(...this.distributionTable) > 1000) {
            const min = Math.min(...this.distributionTable);
            this.distributionTable = this.distributionTable.map(count => count - min);
        }
        
        return workerId;
    }

    async createConnection(clientSocket, sessionId) {
        const workerId = this.assignToWorker(sessionId);
        const proxy = this.proxyManager.getNextProxy();
        
        try {
            // إنشاء اتصال بالبروكسي
            const proxySocket = new net.Socket();
            
            // إعداد مهلة الاتصال
            proxySocket.setTimeout(this.config.server.timeout);
            
            const connectionInfo = {
                id: sessionId,
                clientSocket,
                proxySocket,
                workerId,
                proxy,
                startTime: Date.now(),
                bytes: { in: 0, out: 0 },
                state: 'connecting'
            };
            
            this.pool.set(sessionId, connectionInfo);
            this.workerConnections.set(workerId, connectionInfo);
            
            // إحصاءات العامل
            this.workers[workerId].connections.add(sessionId);
            
            // الاتصال بالبروكسي
            await new Promise((resolve, reject) => {
                proxySocket.connect(proxy.port, proxy.host, () => {
                    connectionInfo.state = 'connected';
                    resolve();
                });
                
                proxySocket.on('error', reject);
                proxySocket.setTimeout(10000, () => {
                    reject(new Error('Proxy connection timeout'));
                });
            });
            
            // إرسال هيدرات CONNECT
            proxySocket.write(this.config.headers.connect);
            
            // إعداد الأنابيب مع تجزئة البيانات
            this.setupPiping(connectionInfo);
            
            this.connectionStats.totalConnections++;
            this.connectionStats.activeConnections++;
            
            this.emit('connectionCreated', connectionInfo);
            
            return connectionInfo;
            
        } catch (error) {
            this.connectionStats.failedConnections++;
            this.cleanupConnection(sessionId);
            throw error;
        }
    }

    setupPiping(connectionInfo) {
        const { clientSocket, proxySocket, id: sessionId } = connectionInfo;
        
        // من العميل إلى البروكسي مع التجزئة
        clientSocket.on('data', (data) => {
            connectionInfo.bytes.in += data.length;
            this.connectionStats.bytesTransferred += data.length;
            
            if (this.config.splitting.enabled) {
                // تقسيم البيانات وإرسالها عبر عمال مختلفين
                const chunks = this.splitter.splitData(data, sessionId);
                this.distributeChunks(chunks, connectionInfo);
            } else {
                // إرسال مباشر بدون تجزئة
                proxySocket.write(data);
            }
        });
        
        // من البروكسي إلى العميل
        proxySocket.on('data', (data) => {
            connectionInfo.bytes.out += data.length;
            this.connectionStats.bytesTransferred += data.length;
            
            // إذا كانت البيانات مجزأة، إعادة تجميعها
            if (this.isSplitData(data)) {
                this.handleSplitResponse(data, sessionId, clientSocket);
            } else {
                clientSocket.write(data);
            }
        });
        
        // معالجة الأخطاء
        clientSocket.on('error', (err) => {
            console.error(`Client socket error: ${err.message}`);
            this.cleanupConnection(sessionId);
        });
        
        proxySocket.on('error', (err) => {
            console.error(`Proxy socket error: ${err.message}`);
            this.cleanupConnection(sessionId);
        });
        
        // إغلاق الاتصال
        clientSocket.on('close', () => {
            this.cleanupConnection(sessionId);
        });
        
        proxySocket.on('close', () => {
            this.cleanupConnection(sessionId);
        });
    }

    distributeChunks(chunks, connectionInfo) {
        chunks.forEach((chunk, index) => {
            const targetWorkerId = (connectionInfo.workerId + index) % 32;
            this.sendToWorker(targetWorkerId, chunk, connectionInfo);
        });
    }

    sendToWorker(workerId, chunk, connectionInfo) {
        // محاكاة إرسال البيانات إلى عامل
        // في التنفيذ الحقيقي، ستكون هذه اتصالات فعلية بين العمليات
        setTimeout(() => {
            connectionInfo.proxySocket.write(chunk.data);
            
            // تحديث إحصاءات العامل
            this.workers[workerId].bytesTransferred += chunk.data.length;
            this.workers[workerId].lastActivity = Date.now();
        }, Math.random() * 10); // تأخير عشوائي لمحاكاة الشبكة
    }

    isSplitData(data) {
        // تحقق إذا كانت البيانات تحتوي على علامات التجزئة
        const str = data.toString();
        return str.includes('multipart/byteranges') || 
               str.includes('boundary=') ||
               str.includes('Content-Range: bytes');
    }

    handleSplitResponse(data, sessionId, clientSocket) {
        try {
            // محاكاة إعادة تجميع البيانات المجزأة
            const reassembled = this.splitter.reassembleData(sessionId);
            clientSocket.write(reassembled);
        } catch (error) {
            console.error(`Failed to reassemble data: ${error.message}`);
        }
    }

    cleanupConnection(sessionId) {
        const connection = this.pool.get(sessionId);
        if (!connection) return;
        
        // إغلاق المقابس
        if (connection.clientSocket && !connection.clientSocket.destroyed) {
            connection.clientSocket.destroy();
        }
        
        if (connection.proxySocket && !connection.proxySocket.destroyed) {
            connection.proxySocket.destroy();
        }
        
        // تنظيف من تجمع العمال
        if (connection.workerId !== undefined) {
            this.workers[connection.workerId].connections.delete(sessionId);
        }
        
        // إزالة من التخزين
        this.pool.delete(sessionId);
        
        // تحديث الإحصائيات
        this.connectionStats.activeConnections--;
        
        this.emit('connectionClosed', {
            sessionId,
            duration: Date.now() - connection.startTime,
            bytes: connection.bytes
        });
    }

    getStats() {
        const uptime = Date.now() - this.connectionStats.startTime;
        
        return {
            pool: {
                total: this.pool.size,
                active: this.connectionStats.activeConnections,
                failed: this.connectionStats.failedConnections,
                bytesTransferred: this.connectionStats.bytesTransferred,
                uptime: Math.floor(uptime / 1000)
            },
            workers: this.workers.map((worker, index) => ({
                id: index,
                connections: worker.connections.size,
                bytesTransferred: worker.bytesTransferred,
                lastActivity: worker.lastActivity,
                active: Date.now() - worker.lastActivity < 60000
            })),
            distribution: this.distributionTable
        };
    }

    getConnectionInfo(sessionId) {
        return this.pool.get(sessionId);
    }

    getAllConnections() {
        return Array.from(this.pool.values());
    }
}

module.exports = ConnectionPool;
