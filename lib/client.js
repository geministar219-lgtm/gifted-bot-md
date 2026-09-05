// ============================================
// SUHAIL-MD BOT - PAIRING CODE VERSION STABLE
// Numéro : 237698730509
// ============================================

const PHONE_NUMBER = '237698730509';

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const fs = require('fs-extra');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const { Boom } = require('@hapi/boom');
require('events').EventEmitter.defaultMaxListeners = 500;

// ===== CONFIG =====
let Config = {};
try {
    Config = require('../config');
} catch (e) {
    Config = { HANDLERS: '.', DATABASE_URI: '' };
}
const prefix = Config.HANDLERS || '.';
const isMongodb = Config.DATABASE_URI?.includes('mongodb') || false;

// ===== BASE DE DONNÉES (optionnelle) =====
if (isMongodb) {
    mongoose.set('strictQuery', true);
    mongoose.connect(Config.DATABASE_URI, {})
        .then(() => console.log('✅ MongoDB connecté'))
        .catch(e => console.error('❌ MongoDB error:', e));
}

// ===== VARIABLES GLOBALES =====
let sock = null;
let isConnecting = false;

// ===== FONCTION DE CONNEXION PRINCIPALE =====
async function connectToWhatsApp() {
    if (isConnecting) return;
    isConnecting = true;
    console.log('🔄 Connexion à WhatsApp en cours...');

    try {
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: ['Suhail-MD', 'Chrome', '1.0.0'],
            markOnlineOnConnect: true,
            logger: Pino({ level: 'silent' }),
            generateHighQualityLinkPreview: true,
            shouldSyncHistoryMessage: true
        });

        sock.ev.on('creds.update', saveCreds);

        // ===== DEMANDE DU CODE D'APPAIRAGE =====
        // On attend 2 secondes pour que le socket soit initialisé
        setTimeout(async () => {
            try {
                const creds = sock.authState?.creds;
                if (!creds || !creds.registered) {
                    console.log('📱 Demande du code d\'appairage pour le numéro', PHONE_NUMBER);
                    const code = await sock.requestPairingCode(PHONE_NUMBER);
                    console.log(`📱 Ton code d'appairage est : ${code}`);
                    console.log('➡️  Entre ce code dans WhatsApp → Paramètres → Appareils liés → Lier avec un numéro');
                } else {
                    console.log('✅ Session existante, pas besoin de code.');
                }
            } catch (err) {
                console.error('❌ Erreur demande code:', err);
            }
        }, 2000);

        // ===== ÉVÉNEMENTS =====
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('📱 QR code généré (ignoré)');
            }

            if (connection === 'open') {
                console.log('✅ Bot connecté avec succès !');
                const botNumber = sock.decodeJid(sock.user.id);
                console.log(`🤖 Numéro du bot : ${botNumber}`);
                console.log(`📝 Préfixe : ${prefix}`);
                console.log(`💾 Base : ${isMongodb ? 'MongoDB' : 'JSON'}`);
                isConnecting = false;
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
                console.log('🔴 Connexion fermée, code:', statusCode);

                if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                    console.log('🔄 Session expirée. Nouveau code dans 5 secondes...');
                    setTimeout(async () => {
                        try {
                            const code = await sock.requestPairingCode(PHONE_NUMBER);
                            console.log(`📱 Ton code d'appairage est : ${code}`);
                            console.log('➡️  Entre ce code dans WhatsApp → Paramètres → Appareils liés → Lier avec un numéro');
                        } catch (err) {
                            console.error('❌ Erreur demande code:', err);
                        }
                    }, 5000);
                } else {
                    console.log('🔄 Reconnexion automatique dans 10 secondes...');
                    isConnecting = false;
                    setTimeout(() => connectToWhatsApp(), 10000);
                }
            }
        });

        // ===== GESTION DES MESSAGES =====
        sock.ev.on('messages.upsert', async (msg) => {
            try {
                const m = msg.messages[0];
                if (!m.message) return;

                const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
                const from = m.key.remoteJid;
                const isGroup = from.endsWith('@g.us');
                const sender = m.key.participant || from;
                const fromMe = m.key.fromMe;

                if (!text) return;
                const botNumber = sock.decodeJid(sock.user.id);
                if (sender === botNumber && !fromMe) return;

                if (!text.startsWith(prefix)) return;

                const args = text.slice(prefix.length).trim().split(' ');
                const command = args.shift().toLowerCase();

                console.log(`📩 Message de ${sender} : ${command}`);

                // ----- COMMANDES -----
                if (command === 'ping') {
                    await sock.sendMessage(from, { text: '🏓 Pong !' });
                }

                if (command === 'menu' || command === 'help') {
                    const menuText = `
╭━━━❰ SUHAIL-MD ❱━━━╮
┃
┃ 🔹 *Commandes :*
┃ • ${prefix}ping
┃ • ${prefix}menu
┃ • ${prefix}info
┃ • ${prefix}tagall (groupes)
┃
╰━━━━━━━━━━━━━━━━━━╯
                    `;
                    await sock.sendMessage(from, { text: menuText });
                }

                if (command === 'info') {
                    const info = `
🤖 *SUHAIL-MD*
👤 Bot : ${botNumber}
📝 Préfixe : ${prefix}
💾 Base : ${isMongodb ? 'MongoDB' : 'JSON'}
⚡ Statut : ✅ Connecté
                    `;
                    await sock.sendMessage(from, { text: info });
                }

                if (command === 'tagall' && isGroup) {
                    try {
                        const groupMeta = await sock.groupMetadata(from);
                        const participants = groupMeta.participants;
                        let mentions = participants.map(p => p.id);
                        let text = '👥 *TAGALL*\n\n';
                        participants.forEach((p, i) => {
                            text += `${i+1}. @${p.id.split('@')[0]}\n`;
                        });
                        await sock.sendMessage(from, { text, mentions });
                    } catch (e) {
                        console.error('Tagall error:', e);
                    }
                }
            } catch (err) {
                console.error('❌ Erreur message:', err);
            }
        });

        sock.ev.on('group-participants.update', async (update) => {
            console.log('👥 Mise à jour groupe:', update);
        });

        // ===== MAINTENIR LE PROCESSUS ACTIF =====
        // On empêche le processus de se terminer
        setInterval(() => {
            // Fonction vide pour maintenir le thread
        }, 60000);

        console.log('✅ Socket initialisé, en attente de connexion...');

    } catch (err) {
        console.error('❌ Erreur fatale dans connectToWhatsApp:', err);
        isConnecting = false;
        setTimeout(() => connectToWhatsApp(), 5000);
    }
}

// ===== LANCEMENT =====
connectToWhatsApp();

// ===== SERVEUR WEB =====
const app = express();
const port = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('🚀 Suhail-MD is running!'));
app.listen(port, () => console.log(`🌐 Serveur web sur http://localhost:${port}`));

// ===== GESTION DES ERREURS =====
process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('💥 Unhandled Rejection:', reason);
});
process.on('SIGTERM', () => {
    console.log('⚠️ SIGTERM reçu, arrêt propre...');
    process.exit(0);
});
