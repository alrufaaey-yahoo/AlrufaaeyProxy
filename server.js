// server.js - الخادم الرئيسي
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const config = require('./config');
const ClusterManager = require('./cluster-manager');

class MainServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        this.config = config;
        this.stats = {
            startTime: Date.now(),
            totalConnections: 0,
            activeSessions: new Set()
        };
        
        this.initialize();
    }

    initialize() {
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
        this.startCluster();
    }

    setupMiddleware() {
        // ملفات ثابتة
        this.app.use(express.static(path.join(__dirname, 'public')));
        
        // بارس JSON
        this.app.use(express.json());
        
        // CORS
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            next();
        });
    }

    setupRoutes() {
        // الصفحة الرئيسية
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });
        
        // API للحصول على الإحصائيات
        this.app.get('/api/stats', (req, res) => {
            res.json(this.getStats());
        });
        
        // API للتحكم
        this.app.post('/api/control', (req, res) => {
            const { action, data } = req.body;
            this.handleControlAction(action, data, res);
        });
        
        // API للحصول على معلومات الاتصال
        this.app.get('/api/connections', (req, res) => {
            res.json({
                active: this.stats.activeSessions.size,
                total: this.stats.totalConnections
            });
        });
        
        // API لصحة النظام
        this.app.get('/api/health', (req, res) => {
            res.json({
                status: 'healthy',
                uptime: process.uptime(),
                timestamp: Date.now()
            });
        });
    }

    setupWebSocket() {
        this.io.on('connection', (socket) => {
            console.log('New client connected to dashboard');
            
            // إرسال البيانات الأولية
            socket.emit('init', this.getStats());
            
            // تحديث دوري للإحصائيات
            const statsInterval = setInterval(() => {
                socket.emit('statsUpdate', this.getStats());
            }, this.config.ui.refreshInterval);
            
            // استقبال الأحداث من العميل
            socket.on('control', (data) => {
                this.handleWebSocketControl(socket, data);
            });
            
            socket.on('disconnect', () => {
                console.log('Client disconnected from dashboard');
                clearInterval(statsInterval);
            });
        });
    }

    startCluster() {
        this.clusterManager = new ClusterManager(config);
        this.clusterManager.start();
    }

    handleControlAction(action, data, res) {
        switch (action) {
            case 'start':
                // بدء جميع العمال
                // (التنفيذ الفعلي يعتمد على نظامك)
                res.json({ success: true, message: 'Workers started' });
                break;
                
            case 'stop':
                // إيقاف جميع العمال
                res.json({ success: true, message: 'Workers stopped' });
                break;
                
            case 'restart':
                // إعادة تشغيل جميع العمال
                res.json({ success: true, message: 'Workers restarted' });
                break;
                
            default:
                res.status(400).json({ error: 'Unknown action' });
        }
    }

    handleWebSocketControl(socket, data) {
        const { action, params } = data;
        
        switch (action) {
            case 'getDetailedStats':
                socket.emit('detailedStats', this.getDetailedStats());
                break;
                
            case 'changeSettings':
                this.updateSettings(params);
                socket.emit('settingsUpdated', { success: true });
                break;
        }
    }

    getStats() {
        const uptime = Date.now() - this.stats.startTime;
        
        return {
            system: {
                uptime: Math.floor(uptime / 1000),
                memory: process.memoryUsage(),
                platform: process.platform,
                nodeVersion: process.version
            },
            connections: {
                total: this.stats.totalConnections,
                active: this.stats.activeSessions.size,
                workers: 32 // عدد العمال
            },
            config: {
                splitting: this.config.splitting.enabled,
                parts: this.config.splitting.parts,
                proxies: this.config.proxies.length
            }
        };
    }

    getDetailedStats() {
        // في التنفيذ الحقيقي، ستجمع الإحصائيات من جميع العمال
        return {
            workers: Array.from({ length: 32 }, (_, i) => ({
                id: i,
                port: this.config.server.basePort + i,
                status: 'active',
                connections: Math.floor(Math.random() * 100),
                bytes: Math.floor(Math.random() * 1000000)
            })),
            proxies: this.config.proxies.map((proxy, i) => ({
                ...proxy,
                status: 'healthy',
                connections: Math.floor(Math.random() * 50)
            }))
        };
    }

    updateSettings(newSettings) {
        // تحديث الإعدادات (بحذر)
        Object.assign(this.config, newSettings);
        console.log('Settings updated:', newSettings);
        
        // نشر التحديثات على جميع العمال
        this.io.emit('configUpdated', this.config);
    }

    start() {
        const port = this.config.ui.port;
        this.server.listen(port, () => {
            console.log(`Dashboard running on http://localhost:${port}`);
            console.log(`Workers listening on ports ${this.config.server.basePort}-${this.config.server.basePort + 31}`);
            console.log(`Connection splitting enabled: ${this.config.splitting.enabled}`);
            console.log(`Number of parts: ${this.config.splitting.parts}`);
            console.log(`Proxies configured: ${this.config.proxies.length}`);
        });
    }
}

// بدء الخادم
if (require.main === module) {
    const mainServer = new MainServer();
    mainServer.start();
    
    // معالجة الأخطاء غير المعالجة
    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
}

module.exports = MainServer;
