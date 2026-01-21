// app.js - تطبيق الواجهة الأمامية
class DashboardApp {
    constructor() {
        this.socket = io();
        this.charts = {};
        this.workers = new Array(32).fill().map((_, i) => ({
            id: i,
            port: 2323 + i,
            active: false,
            connections: 0,
            bytes: 0
        }));
        
        this.proxies = [];
        this.stats = {
            totalConnections: 0,
            activeSessions: 0,
            bytesTransferred: 0,
            uptime: 0
        };
        
        this.init();
    }

    init() {
        this.connectSocket();
        this.initCharts();
        this.renderWorkers();
        this.updateStats();
        this.setupEventListeners();
        
        // تحديث دوري
        setInterval(() => this.updateDashboard(), 2000);
    }

    connectSocket() {
        this.socket.on('connect', () => {
            console.log('Connected to dashboard server');
            this.updateStatus('Connected', 'active');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from dashboard server');
            this.updateStatus('Disconnected', 'inactive');
        });
        
        this.socket.on('init', (data) => {
            console.log('Received initial data:', data);
            this.handleInitData(data);
        });
        
        this.socket.on('statsUpdate', (data) => {
            this.updateStatsData(data);
        });
        
        this.socket.on('configUpdated', (config) => {
            console.log('Configuration updated:', config);
            this.showNotification('Settings updated successfully', 'success');
        });
    }

    handleInitData(data) {
        this.stats = {
            totalConnections: data.connections.total,
            activeSessions: data.connections.active,
            bytesTransferred: 0,
            uptime: data.system.uptime
        };
        
        this.updateDashboard();
    }

    updateStatsData(data) {
        // تحديث الإحصائيات
        this.stats = {
            ...this.stats,
            totalConnections: data.connections?.total || this.stats.totalConnections,
            activeSessions: data.connections?.active || this.stats.activeSessions,
            uptime: data.system?.uptime || this.stats.uptime
        };
        
        // تحديث العمال
        if (data.workers) {
            data.workers.forEach(worker => {
                if (this.workers[worker.id]) {
                    this.workers[worker.id] = {
                        ...this.workers[worker.id],
                        ...worker
                    };
                }
            });
        }
        
        this.updateDashboard();
    }

    initCharts() {
        // مخطط الإنتاجية
        const throughputCtx = document.getElementById('throughputChart').getContext('2d');
        this.charts.throughput = new Chart(throughputCtx, {
            type: 'line',
            data: {
                labels: Array.from({ length: 20 }, (_, i) => i + 1),
                datasets: [{
                    label: 'Throughput (KB/s)',
                    data: [],
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#f9fafb' }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#9ca3af' }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#9ca3af' }
                    }
                }
            }
        });
        
        // مخطط الاتصالات
        const connectionsCtx = document.getElementById('connectionsChart').getContext('2d');
        this.charts.connections = new Chart(connectionsCtx, {
            type: 'bar',
            data: {
                labels: Array.from({ length: 8 }, (_, i) => `Proxy ${i + 1}`),
                datasets: [{
                    label: 'Active Connections',
                    data: [],
                    backgroundColor: 'rgba(118, 75, 162, 0.7)',
                    borderColor: 'rgba(118, 75, 162, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#f9fafb' }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#9ca3af' }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#9ca3af' }
                    }
                }
            }
        });
        
        // بيانات وهمية للعرض
        this.updateChartData();
    }

    updateChartData() {
        // تحديث بيانات المخططات
        const now = new Date();
        const throughputData = Array.from({ length: 20 }, (_, i) => {
            const base = 100;
            const variation = Math.sin(i * 0.5) * 50;
            const random = Math.random() * 30;
            return Math.max(0, base + variation + random);
        });
        
        this.charts.throughput.data.datasets[0].data = throughputData;
        this.charts.throughput.update();
        
        const connectionData = Array.from({ length: 8 }, () => Math.floor(Math.random() * 100));
        this.charts.connections.data.datasets[0].data = connectionData;
        this.charts.connections.update();
        
        // تحديث كل 5 ثواني
        setTimeout(() => this.updateChartData(), 5000);
    }

    renderWorkers() {
        const workersGrid = document.getElementById('workersGrid');
        workersGrid.innerHTML = '';
        
        this.workers.forEach(worker => {
            const workerElement = document.createElement('div');
            workerElement.className = `worker-cell ${worker.active ? 'active' : ''}`;
            workerElement.innerHTML = `
                <div class="worker-id">Worker ${worker.id + 1}</div>
                <div class="worker-stats">${worker.connections}</div>
                <div class="worker-port">:${worker.port}</div>
            `;
            
            workerElement.addEventListener('click', () => {
                this.showWorkerDetails(worker);
            });
            
            workersGrid.appendChild(workerElement);
        });
    }

    renderProxies() {
        const proxyList = document.getElementById('proxyList');
        proxyList.innerHTML = '';
        
        this.proxies.forEach((proxy, index) => {
            const proxyElement = document.createElement('div');
            proxyElement.className = `proxy-item ${proxy.healthy ? '' : 'unhealthy'}`;
            proxyElement.innerHTML = `
                <div class="proxy-info">
                    <div class="proxy-address">${proxy.host}:${proxy.port}</div>
                    <div class="proxy-connections">${proxy.connections || 0} connections</div>
                </div>
                <div class="proxy-status ${proxy.healthy ? 'healthy' : 'unhealthy'}">
                    ${proxy.healthy ? 'Healthy' : 'Unhealthy'}
                </div>
            `;
            
            proxyList.appendChild(proxyElement);
        });
    }

    updateDashboard() {
        // تحديث الإحصائيات
        document.getElementById('totalConnections').textContent = 
            this.stats.totalConnections.toLocaleString();
        
        document.getElementById('activeSessions').textContent = 
            this.stats.activeSessions.toLocaleString();
        
        document.getElementById('bytesTransferred').textContent = 
            this.formatBytes(this.stats.bytesTransferred);
        
        document.getElementById('uptime').textContent = 
            this.formatTime(this.stats.uptime);
        
        // تحديث مخطط التقسيم
        this.updateSplitDiagram();
        
        // تحديث الإحصائيات الحية
        document.getElementById('liveStats').textContent = 
            `${this.stats.activeSessions} active sessions | ${this.formatBytes(this.stats.bytesTransferred)} transferred`;
        
        // تحديث العمال
        this.renderWorkers();
        
        // تحديث البروكسيات إذا كانت متوفرة
        if (this.proxies.length > 0) {
            this.renderProxies();
        }
    }

    updateSplitDiagram() {
        const diagram = document.getElementById('splitDiagram');
        const activeSplits = Math.floor(Math.random() * 50) + 10; // بيانات وهمية
        
        document.getElementById('activeSplits').textContent = activeSplits;
        
        // إنشاء تأثير مرئي للتقسيم
        diagram.innerHTML = '';
        const parts = 32;
        const partWidth = 100 / parts;
        
        for (let i = 0; i < parts; i++) {
            const part = document.createElement('div');
            part.style.position = 'absolute';
            part.style.left = `${i * partWidth}%`;
            part.style.top = '0';
            part.style.width = `${partWidth}%`;
            part.style.height = '100%';
            part.style.background = `rgba(102, 126, 234, ${0.2 + Math.random() * 0.3})`;
            part.style.borderLeft = '1px solid rgba(255, 255, 255, 0.1)';
            part.style.transition = 'all 0.3s';
            
            if (Math.random() > 0.7) {
                part.style.background = 'rgba(118, 75, 162, 0.5)';
            }
            
            diagram.appendChild(part);
        }
    }

    updateStatus(status, type) {
        const statusText = document.getElementById('statusText');
        const statusDot = document.querySelector('.status-dot');
        
        statusText.textContent = status;
        statusDot.className = `status-dot ${type}`;
    }

    showNotification(message, type = 'info') {
        // تنفيذ بسيط للإشعارات
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            border-radius: 10px;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    showWorkerDetails(worker) {
        const details = `
            Worker ID: ${worker.id}
            Port: ${worker.port}
            Status: ${worker.active ? 'Active' : 'Inactive'}
            Connections: ${worker.connections}
            Bytes Transferred: ${this.formatBytes(worker.bytes)}
        `;
        
        alert(details);
    }

    setupEventListeners() {
        // إعداد مستمعي الأحداث للأزرار
        document.querySelector('.btn-start').addEventListener('click', () => this.startSystem());
        document.querySelector('.btn-stop').addEventListener('click', () => this.stopSystem());
        document.querySelector('.btn-restart').addEventListener('click', () => this.restartSystem());
        document.querySelector('.btn-settings').addEventListener('click', () => this.showSettings());
    }

    // وظائف التحكم
    async startSystem() {
        try {
            const response = await fetch('/api/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'start' })
            });
            
            const data = await response.json();
            this.showNotification(data.message, 'success');
            this.updateStatus('Starting...', 'active');
        } catch (error) {
            this.showNotification('Failed to start system', 'error');
        }
    }

    async stopSystem() {
        try {
            const response = await fetch('/api/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'stop' })
            });
            
            const data = await response.json();
            this.showNotification(data.message, 'success');
            this.updateStatus('Stopping...', 'inactive');
        } catch (error) {
            this.showNotification('Failed to stop system', 'error');
        }
    }

    async restartSystem() {
        try {
            const response = await fetch('/api/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'restart' })
            });
            
            const data = await response.json();
            this.showNotification(data.message, 'success');
            this.updateStatus('Restarting...', 'active');
        } catch (error) {
            this.showNotification('Failed to restart system', 'error');
        }
    }

    showSettings() {
        const modal = document.getElementById('settingsModal');
        modal.style.display = 'flex';
        
        // توليد نموذج الإعدادات
        const form = document.getElementById('settingsForm');
        form.innerHTML = `
            <div class="form-group">
                <label for="splittingEnabled">Connection Splitting</label>
                <div class="checkbox-group">
                    <input type="checkbox" id="splittingEnabled" checked>
                    <label for="splittingEnabled">Enable 32-way splitting</label>
                </div>
            </div>
            
            <div class="form-group">
                <label for="chunkSize">Chunk Size (bytes)</label>
                <input type="number" id="chunkSize" class="form-control" value="4096" min="1024" max="16384">
            </div>
            
            <div class="form-group">
                <label for="rotationInterval">Proxy Rotation Interval (ms)</label>
                <input type="number" id="rotationInterval" class="form-control" value="20000" min="5000" max="60000">
            </div>
            
            <div class="form-group">
                <label for="maxConnections">Max Connections</label>
                <input type="number" id="maxConnections" class="form-control" value="10000" min="100" max="50000">
            </div>
            
            <div class="form-group">
                <label for="timeout">Connection Timeout (ms)</label>
                <input type="number" id="timeout" class="form-control" value="60000" min="10000" max="300000">
            </div>
        `;
    }

    closeSettings() {
        const modal = document.getElementById('settingsModal');
        modal.style.display = 'none';
    }

    async saveSettings() {
        const settings = {
            splitting: {
                enabled: document.getElementById('splittingEnabled').checked,
                chunkSize: parseInt(document.getElementById('chunkSize').value)
            },
            proxy: {
                rotationInterval: parseInt(document.getElementById('rotationInterval').value)
            },
            server: {
                maxConnections: parseInt(document.getElementById('maxConnections').value),
                timeout: parseInt(document.getElementById('timeout').value)
            }
        };
        
        try {
            this.socket.emit('control', {
                action: 'changeSettings',
                params: settings
            });
            
            this.closeSettings();
            this.showNotification('Settings saved and applied', 'success');
        } catch (error) {
            this.showNotification('Failed to save settings', 'error');
        }
    }

    // وظائف مساعدة
    formatBytes(bytes) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let value = bytes;
        let unitIndex = 0;
        
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex++;
        }
        
        return `${value.toFixed(2)} ${units[unitIndex]}`;
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

// وظائف عامة للنوافذ
window.rotateProxy = function() {
    app.showNotification('Proxy rotation initiated', 'info');
};

window.refreshProxies = function() {
    app.showNotification('Refreshing proxy health...', 'info');
};

window.startSystem = function() {
    app.startSystem();
};

window.stopSystem = function() {
    app.stopSystem();
};

window.restartSystem = function() {
    app.restartSystem();
};

window.showSettings = function() {
    app.showSettings();
};

window.closeSettings = function() {
    app.closeSettings();
};

window.saveSettings = function() {
    app.saveSettings();
};

// بدء التطبيق عند تحميل الصفحة
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new DashboardApp();
});
