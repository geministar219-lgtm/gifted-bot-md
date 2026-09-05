// ============================================
// SUHAIL-MD BOT - VERSION SIMPLIFIÉE AVEC PAIRING CODE
// Numéro : 237698730509
// ============================================

const PHONE_NUMBER = '237698730509'; // TON NUMÉRO

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const fs = require('fs-extra');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const { Boom } = require('@hapi/boom');
require('events').EventEmitter.defaultMaxListeners = 500;

// ===== CONFIG =====
const Config = require('../config');
const prefix = Config.HANDLERS || '.';
const isMongodb = Config.DATABASE_URI?.includes('mongodb') || false;

// ===== BASE DE DONNÉES =====
if (isMongodb) {
    mongoose.set('strictQuery', true);
    mongoose.connect(Config.DATABASE_URI, {})
        .then(() => console.log('✅ MongoDB connecté'))
        .catch(e => console.error('❌ MongoDB error:', e));
}

// ===== FONCTION PRINCIPALE =====
async function connectToWhatsApp() {
    console.log('🔄 Connexion à WhatsApp en cours...');

    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // QR désactivé
        browser: ['Suhail-MD', 'Chrome', '1.0.0'],
        markOnlineOnConnect: true,
        logger: Pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    // ===== DEMANDE LE CODE D'APPAIRAGE DÈS QUE LE SOCKET EST PRÊT =====
    // On attend un court instant que le socket soit initialisé
    setTimeout(async () => {
        try {
            // Vérifier si la session existe déjà
            const creds = sock.authState?.creds;
            if (!creds || !creds.registered) {
                console.log('📱 Demande du code d\'appairage pour le numéro', PHONE_NUMBER);
                const code = await sock.requestPairingCode(PHONE_NUMBER);
                console.log(`📱 Ton code d'appairage est : ${code}`);
                console.log(`➡️  Entre ce code dans WhatsApp → Paramètres → Appareils liés → Lier avec un numéro`);
            } else {
                console.log('✅ Session existante, pas besoin de code.');
            }
        } catch (err) {
            console.error('❌ Erreur lors de la demande du code:', err);
            // Si erreur, on réessaie après 2 secondes
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(PHONE_NUMBER);
                    console.log(`📱 Ton code d'appairage est : ${code}`);
                    console.log(`➡️  Entre ce code dans WhatsApp → Paramètres → Appareils liés → Lier avec un numéro`);
                } catch (e) {
                    console.error('❌ Échec de la deuxième tentative:', e);
                }
            }, 2000);
        }
    }, 1000);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (connection === 'open') {
            console.log('✅ Bot connecté avec succès !');
            const botNumber = sock.decodeJid(sock.user.id);
            console.log(`🤖 Numéro du bot : ${botNumber}`);
            console.log(`📝 Préfixe : ${prefix}`);
            console.log(`💾 Base de données : ${isMongodb ? 'MongoDB' : 'JSON'}`);
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
            console.log('🔴 Connexion fermée, code:', statusCode);

            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                console.log('🔄 Session expirée. Nouveau code d\'appairage dans 3 secondes...');
                setTimeout(async () => {
                    try {
                        const code = await sock.requestPairingCode(PHONE_NUMBER);
                        console.log(`📱 Ton code d'appairage est : ${code}`);
                        console.log(`➡️  Entre ce code dans WhatsApp → Paramètres → Appareils liés → Lier avec un numéro`);
                    } catch (err) {
                        console.error('❌ Erreur lors de la demande du code:', err);
                    }
                }, 3000);
            } else {
                console.log('🔄 Reconnexion automatique dans 5 secondes...');
                setTimeout(() => connectToWhatsApp(), 5000);
            }
        }

        if (qr) {
            console.log('📱 QR code généré (ignoré)');
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

            // ===== COMMANDES SIMPLES =====
            if (command === 'ping') {
                await sock.sendMessage(from, { text: '🏓 Pong !' });
            }

            if (command === 'menu' || command === 'help') {
                const menuText = `
╭━━━❰ SUHAIL-MD ❱━━━╮
┃
┃ 🔹 *Commandes disponibles :*
┃
┃ • ${prefix}ping → Vérifier la latence
┃ • ${prefix}menu → Ce menu
┃ • ${prefix}info → Infos du bot
┃ • ${prefix}stats → Statistiques
┃
┃ 🔹 *Commandes groupes :*
┃ • ${prefix}tagall → Mentionner tout le monde
┃ • ${prefix}kick @user → Exclure un membre
┃ • ${prefix}promote @user → Admin
┃ • ${prefix}demote @user → Retirer admin
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
📅 Version : 1.2.8
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

    return sock;
}

// ===== LANCEMENT =====
connectToWhatsApp().catch(err => {
    console.error('❌ Erreur fatale:', err);
    process.exit(1);
});

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
