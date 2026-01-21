// notification-service.js - خدمة الإشعارات المتقدمة
const notifier = require('node-notifier');
const EventEmitter = require('events');

class NotificationService extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.notifications = new Map();
        this.notificationId = 1;
        this.queue = [];
        this.isProcessing = false;
    }

    show(title, message, type = 'info', options = {}) {
        const id = this.notificationId++;
        const notification = {
            id,
            title,
            message,
            type,
            timestamp: Date.now(),
            shown: false,
            options
        };

        this.notifications.set(id, notification);
        this.queue.push(notification);
        this.processQueue();

        this.emit('notificationCreated', notification);
        return id;
    }

    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const notification = this.queue.shift();
            
            try {
                await this.showNotification(notification);
                notification.shown = true;
                this.notifications.set(notification.id, notification);
                
                this.emit('notificationShown', notification);
                
                // تأخير بين الإشعارات
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Failed to show notification: ${error.message}`);
                this.emit('notificationFailed', { notification, error });
            }
        }

        this.isProcessing = false;
    }

    async showNotification(notification) {
        const { title, message, type, options } = notification;
        
        const notificationOptions = {
            title: `Port Listener - ${title}`,
            message,
            sound: true,
            wait: false,
            timeout: 5,
            ...options
        };

        // إضافة أيقونة حسب النوع
        switch (type) {
            case 'success':
                notificationOptions.icon = 'path/to/success-icon.png';
                break;
            case 'warning':
                notificationOptions.icon = 'path/to/warning-icon.png';
                break;
            case 'error':
                notificationOptions.icon = 'path/to/error-icon.png';
                break;
            default:
                notificationOptions.icon = 'path/to/info-icon.png';
        }

        return new Promise((resolve, reject) => {
            notifier.notify(notificationOptions, (err, response) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(response);
                }
            });
        });
    }

    // إشعارات خاصة بالنظام
    showStartListening(port) {
        return this.show(
            'Service Started',
            `Port ${port} is now listening for connections`,
            'success',
            { timeout: 10 }
        );
    }

    showStopListening() {
        return this.show(
            'Service Stopped',
            'Port listener service has been stopped',
            'info'
        );
    }

    showProxyChanged(proxy, index) {
        return this.show(
            'Proxy Changed',
            `Switched to proxy ${index + 1}: ${proxy.host}:${proxy.port}`,
            'info',
            { timeout: 3 }
        );
    }

    showConnectionEstablished(sessionId, clientAddress) {
        return this.show(
            'New Connection',
            `Connection from ${clientAddress} (Session: ${sessionId.substring(0, 8)}...)`,
            'info'
        );
    }

    showError(error, context = '') {
        return this.show(
            'Error Occurred',
            `${context}: ${error.message}`,
            'error',
            { timeout: 10 }
        );
    }

    getNotification(id) {
        return this.notifications.get(id);
    }

    getAllNotifications() {
        return Array.from(this.notifications.values());
    }

    clearOldNotifications(maxAge = 3600000) { // ساعة واحدة
        const now = Date.now();
        for (const [id, notification] of this.notifications.entries()) {
            if (now - notification.timestamp > maxAge) {
                this.notifications.delete(id);
            }
        }
    }

    getStats() {
        return {
            total: this.notifications.size,
            shown: Array.from(this.notifications.values()).filter(n => n.shown).length,
            pending: this.queue.length,
            processing: this.isProcessing
        };
    }
}

module.exports = NotificationService;
