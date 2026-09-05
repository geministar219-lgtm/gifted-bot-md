// ============================================================
//  SUHAIL-MD  –  Version Stable (Pairing Code unique)
//  Numéro : 237698730509
// ============================================================

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const fs = require('fs-extra');
const express = require('express');
const mongoose = require('mongoose');
const Config = require('../config');

// ---------- Configuration ----------
const PHONE = '237698730509';               // Ton numéro
const PREFIX = Config.HANDLERS || '.';
const DB_URI = Config.DATABASE_URI || '';
const isMongo = DB_URI.includes('mongodb');

// ---------- Base de données ----------
if (isMongo) {
    mongoose.set('strictQuery', true);
    mongoose.connect(DB_URI)
        .then(() => console.log('✅ MongoDB connecté'))
        .catch(e => console.error('❌ MongoDB error:', e));
}

// ---------- Variable pour éviter les doublons ----------
let pairingRequested = false;

// ---------- Fonction principale ----------
async function startBot() {
    console.log('🔄 Connexion à WhatsApp...');

    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ['Suhail-MD', 'Chrome', '1.0.0'],
        markOnlineOnConnect: true,
        logger: Pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    // ---------- Événement de connexion ----------
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // QR code ignoré
        if (qr) console.log('📱 QR code généré (ignoré)');

        // Connexion réussie
        if (connection === 'open') {
            console.log('✅ Bot connecté !');
            const botNumber = sock.decodeJid(sock.user.id);
            console.log(`🤖 Numéro du bot : ${botNumber}`);
            console.log(`📝 Préfixe : ${PREFIX}`);
            console.log(`💾 Base : ${isMongo ? 'MongoDB' : 'JSON'}`);
            // Une fois connecté, on ne demande plus de code
            pairingRequested = true;
            return;
        }

        // Connexion fermée
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
            console.log(`🔴 Connexion fermée (code ${code})`);

            // Si la session est invalide et qu'on n'a pas encore demandé de code
            if ((code === DisconnectReason.loggedOut || code === 401) && !pairingRequested) {
                console.log('📱 Demande du code d’appairage...');
                try {
                    const pairCode = await sock.requestPairingCode(PHONE);
                    console.log(`📱 Code : ${pairCode}`);
                    console.log('➡️  Entre-le dans WhatsApp → Paramètres → Appareils liés → Lier avec un numéro');
                    pairingRequested = true;
                } catch (err) {
                    console.error('❌ Erreur lors de la demande du code :', err.message);
                }
            } else if (code === 408) {
                console.log('⏳ Timeout, en attente...');
            } else {
                // Autre erreur : on redémarre après 10s
                console.log('🔄 Redémarrage dans 10s...');
                setTimeout(() => startBot(), 10000);
            }
        }
    });

    // ---------- Gestion des messages ----------
    sock.ev.on('messages.upsert', async (msg) => {
        try {
            const m = msg.messages[0];
            if (!m.message) return;

            const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
            const from = m.key.remoteJid;
            const sender = m.key.participant || from;
            const fromMe = m.key.fromMe;
            const isGroup = from.endsWith('@g.us');

            if (!text || !text.startsWith(PREFIX)) return;
            const args = text.slice(PREFIX.length).trim().split(' ');
            const cmd = args.shift().toLowerCase();

            const botNumber = sock.decodeJid(sock.user.id);
            if (sender === botNumber && !fromMe) return;

            console.log(`📩 Commande : ${cmd} de ${sender}`);

            // ---------- Commandes ----------
            if (cmd === 'ping') {
                await sock.sendMessage(from, { text: '🏓 Pong !' });
            }

            if (cmd === 'menu') {
                const menu = `
╭━❰ SUHAIL-MD ❱━╮
┃
┃  📌 ${PREFIX}ping
┃  📌 ${PREFIX}menu
┃  📌 ${PREFIX}info
┃  📌 ${PREFIX}tagall (groupes)
┃
╰━━━━━━━━━━━━━━╯`;
                await sock.sendMessage(from, { text: menu });
            }

            if (cmd === 'info') {
                const info = `
🤖 Bot : ${botNumber}
📝 Préfixe : ${PREFIX}
💾 Base : ${isMongo ? 'MongoDB' : 'JSON'}
⚡ Statut : ✅ Connecté`;
                await sock.sendMessage(from, { text: info });
            }

            if (cmd === 'tagall' && isGroup) {
                try {
                    const meta = await sock.groupMetadata(from);
                    const mentions = meta.participants.map(p => p.id);
                    let txt = '👥 TAGALL\n\n';
                    meta.participants.forEach((p, i) => {
                        txt += `${i+1}. @${p.id.split('@')[0]}\n`;
                    });
                    await sock.sendMessage(from, { text: txt, mentions });
                } catch (e) {
                    console.error('Tagall error:', e);
                }
            }

        } catch (err) {
            console.error('❌ Erreur message:', err);
        }
    });

    sock.ev.on('group-participants.update', (update) => {
        console.log('👥 Mise à jour groupe:', update);
    });

    return sock;
}

// ---------- Lancement ----------
startBot().catch(err => {
    console.error('❌ Erreur fatale :', err);
});

// ---------- Serveur Web (keep‑alive) ----------
const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('🚀 Suhail-MD is running'));
app.listen(PORT, () => console.log(`🌐 Serveur web : http://localhost:${PORT}`));

// ---------- Gestion des exceptions ----------
process.on('uncaughtException', (err) => console.error('💥 Uncaught Exception:', err));
process.on('unhandledRejection', (reason) => console.error('💥 Unhandled Rejection:', reason));
