// worker-server.js - خادم العامل
const net = require('net');
const config = require('./config');
const ProxyManager = require('./proxy-manager');
const ConnectionSplitter = require('./connection-splitter');
const ConnectionPool = require('./connection-pool');
const NotificationService = require('./notification-service');

class WorkerServer {
    constructor() {
        this.workerId = parseInt(process.env.WORKER_ID) || 0;
        this.workerTotal = parseInt(process.env.WORKER_TOTAL) || 1;
        this.config = config;
        
        this.initializeComponents();
        this.setupHeartbeat();
    }

    initializeComponents() {
        console.log(`Worker ${this.workerId} initializing...`);
        
        // تهيئة المكونات
        this.proxyManager = new ProxyManager(config);
        this.splitter = new ConnectionSplitter(config);
        this.notificationService = new NotificationService(config);
        
        // تعديل إعدادات الخادم لهذا العامل
        this.serverConfig = {
            ...config.server,
            port: config.server.basePort + this.workerId
        };
        
        // إنشاء تجمع الاتصالات
        this.connectionPool = new ConnectionPool(
            config,
            this.proxyManager,
            this.splitter
        );
        
        // إعداد معالج الأحداث
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // أحداث مدير البروكسيات
        this.proxyManager.on('proxyChanged', (data) => {
            this.notificationService.showProxyChanged(data.proxy, data.index);
            
            // إرسال تحديث إلى العملية الرئيسية
            if (process.send) {
                process.send({
                    type: 'proxyChanged',
                    workerId: this.workerId,
                    data
                });
            }
        });
        
        // أحداث تجمع الاتصالات
        this.connectionPool.on('connectionCreated', (connection) => {
            console.log(`Worker ${this.workerId}: New connection ${connection.id}`);
            
            this.notificationService.showConnectionEstablished(
                connection.id,
                connection.clientSocket.remoteAddress
            );
        });
        
        this.connectionPool.on('connectionClosed', (data) => {
            console.log(`Worker ${this.workerId}: Connection closed after ${data.duration}ms`);
        });
    }

    setupHeartbeat() {
        setInterval(() => {
            const memoryUsage = process.memoryUsage().rss;
            
            if (process.send) {
                process.send({
                    type: 'heartbeat',
                    workerId: this.workerId,
                    memory: memoryUsage,
                    stats: this.getStats()
                });
            }
        }, 10000);
    }

    start() {
        // إنشاء خادم TCP
        this.server = net.createServer((clientSocket) => {
            this.handleClientConnection(clientSocket);
        });
        
        // بدء الاستماع
        this.server.listen(this.serverConfig.port, this.serverConfig.host, () => {
            console.log(`Worker ${this.workerId} listening on port ${this.serverConfig.port}`);
            
            this.notificationService.showStartListening(this.serverConfig.port);
            
            // بدء تبديل البروكسيات
            this.proxyManager.startRotation();
            
            // إرسال رسالة بدء التشغيل
            if (process.send) {
                process.send({
                    type: 'started',
                    workerId: this.workerId,
                    port: this.serverConfig.port
                });
            }
        });
        
        // معالجة الأخطاء
        this.server.on('error', (error) => {
            console.error(`Worker ${this.workerId} server error:`, error);
            this.notificationService.showError(error, 'Server error');
        });
        
        // تنظيف الدورات
        setInterval(() => {
            this.splitter.cleanupOldSessions();
            this.notificationService.clearOldNotifications();
        }, 60000);
    }

    async handleClientConnection(clientSocket) {
        const sessionId = this.splitter.generateSessionId();
        
        try {
            await this.connectionPool.createConnection(clientSocket, sessionId);
            
            // إرسال رد اتصال ناجح
            const successResponse = 'HTTP/1.1 200 Connection Established\r\n\r\n';
            clientSocket.write(successResponse);
            
        } catch (error) {
            console.error(`Worker ${this.workerId} connection error:`, error);
            
            // إرسال رد خطأ
            const errorResponse = 'HTTP/1.1 500 Connection Failed\r\n\r\n';
            clientSocket.write(errorResponse);
            clientSocket.end();
            
            this.notificationService.showError(error, 'Connection failed');
        }
    }

    stop() {
        console.log(`Worker ${this.workerId} stopping...`);
        
        if (this.server) {
            this.server.close();
        }
        
        if (this.proxyManager) {
            this.proxyManager.stopRotation();
        }
        
        this.notificationService.showStopListening();
        
        console.log(`Worker ${this.workerId} stopped`);
    }

    getStats() {
        return {
            workerId: this.workerId,
            port: this.serverConfig.port,
            connections: this.connectionPool.getStats(),
            splitter: this.splitter.getStats(),
            proxies: this.proxyManager.getStats(),
            notifications: this.notificationService.getStats(),
            memory: process.memoryUsage(),
            uptime: process.uptime()
        };
    }
}

// بدء الخادم إذا كان الملف يُنفذ مباشرة
if (require.main === module) {
    const server = new WorkerServer();
    server.start();
    
    // معالجة إشارات الإغلاق
    process.on('SIGINT', () => {
        server.stop();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        server.stop();
        process.exit(0);
    });
}

module.exports = WorkerServer;
