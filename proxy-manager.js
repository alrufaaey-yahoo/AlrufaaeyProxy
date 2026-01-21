// proxy-manager.js - مدير البروكسيات المتقدم
const EventEmitter = require('events');
const net = require('net');

class ProxyManager extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.proxies = [...config.proxies];
        this.currentIndex = 0;
        this.activeConnections = new Map();
        this.proxyStats = new Map();
        this.rotationTimer = null;
        this.healthTimer = null;
        
        this.initProxyStats();
    }

    initProxyStats() {
        this.proxies.forEach(proxy => {
            const key = `${proxy.host}:${proxy.port}`;
            this.proxyStats.set(key, {
                connections: 0,
                failures: 0,
                success: 0,
                latency: 0,
                lastCheck: Date.now(),
                healthy: true
            });
        });
    }

    getNextProxy() {
        if (this.config.proxy.loadBalancing === 'weighted-round-robin') {
            return this.getWeightedProxy();
        } else {
            return this.getRoundRobinProxy();
        }
    }

    getRoundRobinProxy() {
        this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
        const proxy = this.proxies[this.currentIndex];
        
        this.emit('proxyChanged', {
            index: this.currentIndex,
            proxy: proxy,
            timestamp: Date.now()
        });
        
        return proxy;
    }

    getWeightedProxy() {
        const healthyProxies = this.proxies.filter((proxy, index) => {
            const key = `${proxy.host}:${proxy.port}`;
            const stats = this.proxyStats.get(key);
            return stats.healthy;
        });

        if (healthyProxies.length === 0) {
            return this.proxies[this.currentIndex];
        }

        const totalWeight = healthyProxies.reduce((sum, proxy) => sum + proxy.weight, 0);
        let random = Math.random() * totalWeight;
        
        for (const proxy of healthyProxies) {
            random -= proxy.weight;
            if (random <= 0) {
                return proxy;
            }
        }
        
        return healthyProxies[0];
    }

    async checkProxyHealth(proxy) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            const timeout = setTimeout(() => {
                socket.destroy();
                resolve(false);
            }, 5000);

            socket.connect(proxy.port, proxy.host, () => {
                clearTimeout(timeout);
                socket.destroy();
                resolve(true);
            });

            socket.on('error', () => {
                clearTimeout(timeout);
                resolve(false);
            });
        });
    }

    async healthCheck() {
        for (const proxy of this.proxies) {
            const key = `${proxy.host}:${proxy.port}`;
            const stats = this.proxyStats.get(key);
            const isHealthy = await this.checkProxyHealth(proxy);
            
            stats.healthy = isHealthy;
            stats.lastCheck = Date.now();
            
            if (!isHealthy) {
                stats.failures++;
                this.emit('proxyUnhealthy', { proxy, stats });
                
                if (stats.failures >= this.config.proxy.maxFailures) {
                    console.warn(`Proxy ${key} marked as unhealthy after ${stats.failures} failures`);
                }
            } else {
                stats.success++;
                stats.failures = 0;
            }
            
            this.proxyStats.set(key, stats);
        }
    }

    startRotation() {
        if (this.rotationTimer) {
            clearInterval(this.rotationTimer);
        }
        
        this.rotationTimer = setInterval(() => {
            this.getNextProxy();
        }, this.config.proxy.rotationInterval);

        if (this.healthTimer) {
            clearInterval(this.healthTimer);
        }
        
        this.healthTimer = setInterval(() => {
            this.healthCheck();
        }, this.config.proxy.healthCheckInterval);
    }

    stopRotation() {
        if (this.rotationTimer) {
            clearInterval(this.rotationTimer);
            this.rotationTimer = null;
        }
        
        if (this.healthTimer) {
            clearInterval(this.healthTimer);
            this.healthTimer = null;
        }
    }

    getStats() {
        const stats = {
            totalProxies: this.proxies.length,
            healthyProxies: 0,
            unhealthyProxies: 0,
            totalConnections: 0,
            proxies: []
        };

        this.proxies.forEach(proxy => {
            const key = `${proxy.host}:${proxy.port}`;
            const proxyStats = this.proxyStats.get(key);
            stats.totalConnections += proxyStats.connections;
            
            const proxyInfo = {
                host: proxy.host,
                port: proxy.port,
                healthy: proxyStats.healthy,
                connections: proxyStats.connections,
                failures: proxyStats.failures,
                success: proxyStats.success,
                lastCheck: proxyStats.lastCheck
            };
            
            stats.proxies.push(proxyInfo);
            
            if (proxyStats.healthy) {
                stats.healthyProxies++;
            } else {
                stats.unhealthyProxies++;
            }
        });

        return stats;
    }
}

module.exports = ProxyManager;
