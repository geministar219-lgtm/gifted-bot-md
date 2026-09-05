// ============================================================
//  SUHAIL-MD  –  Version FINALE (sans PM2)
//  Numéro : 237698730509
// ============================================================

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const fs = require('fs-extra');
const express = require('express');

const PHONE = '237698730509';
const SESSION_DIR = './session';

let pairingRequested = false;
let isConnected = false;

async function startBot() {
    console.log('🔄 Démarrage...');

    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ['Suhail-MD', 'Chrome', '1.0.0'],
        markOnlineOnConnect: true,
        logger: Pino({ level: 'silent' }),
        connectTimeoutMs: 120000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) console.log('📱 QR (ignoré)');

        if (connection === 'open') {
            isConnected = true;
            console.log('✅ Bot connecté !');
            console.log(`🤖 ${sock.decodeJid(sock.user.id)}`);
            console.log('💾 Session sauvegardée.');
            return;
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
            console.log(`🔴 Fermé (${code})`);

            if ((code === DisconnectReason.loggedOut || code === 401) && !pairingRequested) {
                pairingRequested = true;
                console.log('📱 Demande du code...');
                try {
                    const c = await sock.requestPairingCode(PHONE);
                    console.log(`📱 CODE : ${c}`);
                    console.log('➡️  Entre-le dans WhatsApp → Paramètres → Appareils liés → Lier');
                } catch (e) {
                    console.error('❌ Erreur :', e.message);
                }
            } else if (code === 408) {
                console.log('⏳ Timeout, en attente...');
            } else if (!isConnected) {
                console.log('🔄 Redémarrage dans 15s...');
                setTimeout(startBot, 15000);
            }
        }
    });

    sock.ev.on('messages.upsert', async (msg) => {
        try {
            const m = msg.messages[0];
            if (!m.message) return;
            const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
            const from = m.key.remoteJid;
            const sender = m.key.participant || from;
            if (!text || !text.startsWith('.')) return;
            const cmd = text.slice(1).trim().split(' ')[0].toLowerCase();
            const bot = sock.decodeJid(sock.user.id);
            if (sender === bot) return;
            console.log(`📩 ${cmd} de ${sender}`);
            if (cmd === 'ping') await sock.sendMessage(from, { text: '🏓 Pong !' });
            if (cmd === 'menu') await sock.sendMessage(from, { text: '.ping .menu .info' });
            if (cmd === 'info') await sock.sendMessage(from, { text: `🤖 ${bot}\n📝 Préfixe : .` });
        } catch (e) { console.error('Erreur message:', e); }
    });

    return sock;
}

startBot().catch(e => console.error('❌ Fatal:', e));

const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('🚀 Suhail-MD running'));
app.listen(PORT, () => console.log(`🌐 Web: http://localhost:${PORT}`));

process.on('uncaughtException', (e) => console.error('💥 Exception:', e));
process.on('unhandledRejection', (e) => console.error('💥 Rejection:', e));
