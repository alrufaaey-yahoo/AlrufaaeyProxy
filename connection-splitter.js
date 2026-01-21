// connection-splitter.js - مقسم الاتصالات إلى 32 جزء
const crypto = require('crypto');
const EventEmitter = require('events');

class ConnectionSplitter extends EventEmitter {
    constructor(config) {
        super();
        this.config = config.splitting;
        this.parts = this.config.parts;
        this.chunks = new Map(); // تخزين أجزاء الاتصال
        this.activeSplits = new Map();
        this.sequenceCounters = new Map();
        
        console.log(`Connection splitter initialized with ${this.parts} parts`);
    }

    generateSessionId() {
        return crypto.randomBytes(16).toString('hex');
    }

    splitData(data, sessionId) {
        if (!this.config.enabled) {
            return [{ sessionId, part: 0, total: 1, data, index: 0 }];
        }

        const chunkSize = this.config.chunkSize;
        const dataLength = data.length;
        const totalParts = Math.ceil(dataLength / chunkSize);
        
        // إذا كانت البيانات أصغر من الحد الأدنى، لا تقسم
        if (totalParts <= 1) {
            return [{ sessionId, part: 0, total: 1, data, index: 0 }];
        }

        const chunks = [];
        for (let i = 0; i < totalParts; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, dataLength);
            const chunkData = data.slice(start, end);
            
            chunks.push({
                sessionId,
                part: i,
                total: totalParts,
                data: chunkData,
                index: i,
                checksum: this.calculateChecksum(chunkData)
            });
        }

        // تخزين المعلومات عن الجلسة
        this.chunks.set(sessionId, {
            totalParts,
            receivedParts: new Set(),
            chunks: chunks,
            timestamp: Date.now()
        });

        return chunks;
    }

    reassembleData(sessionId) {
        const session = this.chunks.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        if (session.receivedParts.size !== session.totalParts) {
            throw new Error(`Missing parts for session ${sessionId}: ${session.receivedParts.size}/${session.totalParts}`);
        }

        // ترتيب الأجزاء حسب الفهرس
        const orderedChunks = session.chunks.sort((a, b) => a.index - b.index);
        
        // دمج البيانات
        const buffers = orderedChunks.map(chunk => chunk.data);
        const assembledData = Buffer.concat(buffers);

        // التحقق من صحة البيانات
        const originalChecksum = this.calculateChecksum(assembledData);
        const expectedChecksum = this.calculateOverallChecksum(session.chunks);
        
        if (originalChecksum !== expectedChecksum) {
            throw new Error('Data integrity check failed');
        }

        // تنظيف الجلسة
        this.chunks.delete(sessionId);

        return assembledData;
    }

    receiveChunk(chunk) {
        const { sessionId, part, data, checksum } = chunk;
        
        // التحقق من صحة البيانات
        const calculatedChecksum = this.calculateChecksum(data);
        if (calculatedChecksum !== checksum) {
            throw new Error(`Checksum mismatch for chunk ${part} of session ${sessionId}`);
        }

        const session = this.chunks.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        // تخزين الجزء
        session.chunks[part].data = data;
        session.receivedParts.add(part);

        // التحقق إذا اكتملت جميع الأجزاء
        if (session.receivedParts.size === session.totalParts) {
            this.emit('sessionComplete', sessionId);
        }

        return session.receivedParts.size;
    }

    calculateChecksum(data) {
        return crypto.createHash('md5').update(data).digest('hex');
    }

    calculateOverallChecksum(chunks) {
        const allData = Buffer.concat(chunks.map(chunk => chunk.data));
        return this.calculateChecksum(allData);
    }

    cleanupOldSessions(maxAge = 300000) { // 5 دقائق
        const now = Date.now();
        for (const [sessionId, session] of this.chunks.entries()) {
            if (now - session.timestamp > maxAge) {
                this.chunks.delete(sessionId);
                console.log(`Cleaned up old session: ${sessionId}`);
            }
        }
    }

    getSessionStatus(sessionId) {
        const session = this.chunks.get(sessionId);
        if (!session) {
            return { exists: false };
        }

        return {
            exists: true,
            totalParts: session.totalParts,
            receivedParts: session.receivedParts.size,
            complete: session.receivedParts.size === session.totalParts,
            age: Date.now() - session.timestamp
        };
    }

    getStats() {
        return {
            activeSessions: this.chunks.size,
            totalChunks: Array.from(this.chunks.values())
                .reduce((sum, session) => sum + session.chunks.length, 0),
            config: this.config
        };
    }
}

module.exports = ConnectionSplitter;
