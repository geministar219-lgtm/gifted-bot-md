// ============================================
// SUHAIL-MD BOT - VERSION SIMPLIFIÉE
// Avec pairing code intégré
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
                console.log('🔄 Session expirée. Demande d\'un nouveau code d\'appairage...');
                try {
                    const code = await sock.requestPairingCode(PHONE_NUMBER);
                    console.log(`📱 Ton code d'appairage est : ${code}`);
                    console.log(`➡️  Entre ce code dans WhatsApp → Paramètres → Appareils liés → Lier avec un numéro`);
                } catch (err) {
                    console.error('❌ Erreur lors de la demande du code:', err);
                }
            } else {
                console.log('🔄 Reconnexion automatique dans 5 secondes...');
                setTimeout(() => connectToWhatsApp(), 5000);
            }
        }

        if (qr) {
            // On ignore le QR (on utilise le pairing code)
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

            // Ignorer les messages du bot lui-même
            const botNumber = sock.decodeJid(sock.user.id);
            if (sender === botNumber && !fromMe) return;

            // Vérifier le préfixe
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

            if (command === 'stats') {
                const stats = `
📊 *STATISTIQUES*
👥 Groupes : ${(await sock.groupFetchAllParticipating()).size || 0}
💬 Messages : ${Object.keys(global._MSGS || {}).length || 0}
📈 Uptime : ${process.uptime().toFixed(0)} secondes
                `;
                await sock.sendMessage(from, { text: stats });
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
        // Tu peux ajouter des actions ici (ex: bienvenue, au revoir)
    });

    return sock;
}

// ===== LANCEMENT =====
connectToWhatsApp().catch(err => {
    console.error('❌ Erreur fatale:', err);
    process.exit(1);
});

// ===== SERVEUR WEB (optionnel) =====
const app = express();
const port = process.env.PORT || 8000;
app.get('/', (req, res) => res.send('🚀 Suhail-MD is running!'));
app.listen(port, () => console.log(`🌐 Serveur web sur http://localhost:${port}`));

// ===== GESTION DES ERREURS =====
process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('💥 Unhandled Rejection:', reason);
});
