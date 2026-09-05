// ============================================================
//  SUHAIL-MD  –  Version ULTRA STABLE
//  Numéro : 237698730509
//  Un seul code, pas de boucle infinie, keep-alive
// ============================================================

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const fs = require('fs-extra');
const express = require('express');

// ---------- Configuration ----------
const PHONE = '237698730509';
const PREFIX = '.';
const SESSION_DIR = './session';

// ---------- Variables ----------
let pairingRequested = false;
let isConnected = false;
let reconnectTimer = null;

// ---------- Fonction de connexion ----------
async function startBot() {
    console.log('🔄 Démarrage du bot...');

    try {
        // Créer le dossier de session s'il n'existe pas
        if (!fs.existsSync(SESSION_DIR)) {
            fs.mkdirSync(SESSION_DIR, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: ['Suhail-MD', 'Chrome', '1.0.0'],
            markOnlineOnConnect: true,
            logger: Pino({ level: 'silent' }),
            // ⚡ IMPORTANT : empêcher les reconnexions automatiques intempestives
            shouldReconnect: () => false,
            // ⚡ Timeout plus long
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
        });

        sock.ev.on('creds.update', saveCreds);

        // ---------- Événement : mise à jour de la connexion ----------
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            // QR code ignoré
            if (qr) {
                console.log('📱 QR code généré (ignoré)');
            }

            // Connexion réussie
            if (connection === 'open') {
                if (!isConnected) {
                    isConnected = true;
                    console.log('✅ Bot connecté avec succès !');
                    const botNumber = sock.decodeJid(sock.user.id);
                    console.log(`🤖 Numéro du bot : ${botNumber}`);
                    console.log(`📝 Préfixe : ${PREFIX}`);
                    console.log('💾 Session sauvegardée !');
                    // Si un timer de reconnexion est actif, on l'annule
                    if (reconnectTimer) {
                        clearTimeout(reconnectTimer);
                        reconnectTimer = null;
                    }
                }
                return;
            }

            // Connexion fermée
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
                console.log(`🔴 Connexion fermée (code: ${statusCode})`);

                // Si la session existe et qu'on est déjà connecté, on laisse faire
                if (isConnected) {
                    console.log('ℹ️ Session active, reconnexion automatique dans 5s...');
                    if (!reconnectTimer) {
                        reconnectTimer = setTimeout(() => {
                            reconnectTimer = null;
                            startBot().catch(() => {});
                        }, 5000);
                    }
                    return;
                }

                // ===== CAS CRITIQUE : session invalide ou inexistante =====
                if ((statusCode === DisconnectReason.loggedOut || statusCode === 401) && !pairingRequested) {
                    console.log('📱 Demande du code d\'appairage...');
                    try {
                        const code = await sock.requestPairingCode(PHONE);
                        console.log(`📱 Code : ${code}`);
                        console.log('➡️  Entre ce code dans WhatsApp → Paramètres → Appareils liés → Lier avec un numéro');
                        pairingRequested = true;
                    } catch (err) {
                        console.error('❌ Erreur lors de la demande du code :', err.message);
                        // On réessaie dans 10 secondes si la demande échoue
                        setTimeout(() => {
                            pairingRequested = false;
                            startBot().catch(() => {});
                        }, 10000);
                    }
                    return;
                }

                // Timeout : on attend
                if (statusCode === 408) {
                    console.log('⏳ Timeout, en attente...');
                    // Ne pas redémarrer, juste attendre
                    return;
                }

                // Autres erreurs : on redémarre après un délai
                console.log('🔄 Redémarrage dans 10s...');
                if (!reconnectTimer) {
                    reconnectTimer = setTimeout(() => {
                        reconnectTimer = null;
                        startBot().catch(() => {});
                    }, 10000);
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

    } catch (err) {
        console.error('❌ Erreur dans startBot :', err);
        // Redémarrage après un délai
        if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                startBot().catch(() => {});
            }, 10000);
        }
        return null;
    }
}

// ---------- Lancement ----------
console.log('🚀 Bot en cours de démarrage...');
startBot().catch(err => {
    console.error('❌ Erreur fatale :', err);
});

// ---------- Serveur Web (keep-alive) ----------
const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => {
    res.send('🚀 Suhail-MD is running');
});
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', connected: isConnected, uptime: process.uptime() });
});
app.listen(PORT, () => {
    console.log(`🌐 Serveur web sur http://localhost:${PORT}`);
});

// ---------- Gestion des erreurs ----------
process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
    // Ne pas quitter, laisser le processus tourner
});

process.on('unhandledRejection', (reason) => {
    console.error('💥 Unhandled Rejection:', reason);
    // Ne pas quitter, laisser le processus tourner
});

// ---------- Keep-alive : ping le serveur toutes les minutes ----------
setInterval(() => {
    try {
        // Simplement une requête interne pour garder le processus actif
        // (sur Railway, cela empêche le conteneur de s'endormir)
        console.log('💓 Keep-alive ping');
    } catch (e) {
        // Ignorer
    }
}, 60000);

console.log('✅ Bot initialisé. Le processus reste actif.');
