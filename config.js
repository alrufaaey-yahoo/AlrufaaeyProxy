// config.js - إعدادات النظام
module.exports = {
    // قائمة البروكسيات الأصلية
    proxies: [
        { host: '157.240.195.32', port: 8080, weight: 10 },
        { host: '157.240.253.39', port: 8080, weight: 10 },
        { host: '157.240.196.32', port: 8080, weight: 10 },
        { host: '157.240.9.39', port: 8080, weight: 10 },
        { host: '31.13.83.39', port: 8080, weight: 10 },
        { host: '102.132.97.39', port: 8080, weight: 10 },
        { host: '31.13.84.39', port: 8080, weight: 10 },
        { host: '185.60.218.39', port: 8080, weight: 10 }
    ],

    // إعدادات الخادم
    server: {
        host: '0.0.0.0',
        basePort: 2323,
        maxConnections: 10000,
        timeout: 60000,
        keepAlive: true,
        keepAliveDelay: 5000
    },

    // إعدادات تقسيم الاتصال
    splitting: {
        enabled: true,
        parts: 32, // عدد الأجزاء
        chunkSize: 4096, // حجم كل جزء بالبايت
        maxRetries: 3,
        timeoutPerPart: 30000
    },

    // إعدادات البروكسي
    proxy: {
        rotationInterval: 20000, // تبديل كل 20 ثانية
        healthCheckInterval: 10000,
        maxFailures: 3,
        loadBalancing: 'weighted-round-robin'
    },

    // الهيدرات الثابتة
    headers: {
        connect: "CONNECT lifetwist.net:443 HTTP/1.1\r\n" +
                 "Host: lifetwist.net:443\r\n" +
                 "User-Agent: Mozilla/5.0 (Linux; Android 14; SM-A245F Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/133.0.6943.138 Mobile Safari/537.36 [FBAN/InternetOrgApp;FBAV/166.0.0.0.169;]\r\n" +
                 "x-iorg-bsid: a08359b0-d7ec-4cb5-97bf-000bdc29ec87\r\n" +
                 "\r\n",
        
        // هيدرات إضافية للتجزئة
        multipart: {
            boundary: "----WebKitFormBoundary7MA4YWxkTrZu0gW",
            contentType: "multipart/byteranges; boundary="
        }
    },

    // إعدادات التجميع
    clustering: {
        enabled: true,
        workers: 4, // عدد العمال (يجب أن يكون مقسوما على 32)
        autoRestart: true,
        memoryLimit: 512 // MB
    },

    // إعدادات التسجيل
    logging: {
        level: 'debug',
        file: 'port-listener.log',
        rotation: {
            size: '10m',
            keep: 5
        }
    },

    // إعدادات الواجهة
    ui: {
        port: 3000,
        refreshInterval: 1000,
        theme: 'dark'
    }
};
