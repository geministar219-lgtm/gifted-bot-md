// ============================================================
//  SUHAIL-MD  –  Version "Attente Infinie" pour Railway
//  Numéro : 237698730509
// ============================================================

const PHONE_NUMBER = '237698730509';
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const fs = require('fs-extra');
const express = require('express');

const SESSION_DIR = './session';
let isConnected = false;
let codeShown = false;

// ===== FONCTION PRINCIPALE =====
async function startBot() {
    console.log('🔄 Démarrage du bot...');

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

    // ===== DEMANDER LE CODE UNE SEULE FOIS =====
    const creds = state.creds;
    if (!creds || !creds.registered) {
        if (!codeShown) {
            console.log('📱 Demande du code d\'appairage...');
            try {
                const code = await sock.requestPairingCode(PHONE_NUMBER);
                console.log(`📱 CODE : ${code}`);
                console.log('➡️  Entre ce code dans WhatsApp → Paramètres → Appareils liés → Lier avec un numéro');
                console.log('⏳ Le bot attend ta connexion... (Ne redémarre pas)');
                codeShown = true;
            } catch (e) {
                console.error('❌ Erreur lors de la demande du code :', e.message);
            }
        }
    } else {
        console.log('✅ Session existante, connexion en cours...');
    }

    // ===== ÉVÉNEMENT DE CONNEXION =====
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) console.log('📱 QR (ignoré)');

        if (connection === 'open') {
            isConnected = true;
            console.log('✅ Bot connecté avec succès !');
            console.log(`🤖 ${sock.decodeJid(sock.user.id)}`);
            console.log('💾 Session sauvegardée.');
            return;
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
            console.log(`🔴 Connexion fermée (code: ${code})`);

            if (isConnected) {
                console.log('ℹ️ Session active, reconnexion automatique...');
                return;
            }

            // Si le code a été affiché, on attend (on ne fait rien)
            if (codeShown) {
                console.log('⏳ En attente de la connexion...');
                // On ne redémarre pas, on attend
                return;
            }
        }
    });

    // ===== BOUCLE INFINIE POUR GARDER LE PROCESSUS ACTIF =====
    // Cette boucle empêche le conteneur de se terminer
    while (!isConnected) {
        // Attendre 5 secondes avant de revérifier
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log('💓 En attente de connexion... (le bot est actif)');
    }

    // ===== GESTION DES MESSAGES =====
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
            console.log(`📩 Commande : ${cmd} de ${sender}`);

            if (cmd === 'ping') await sock.sendMessage(from, { text: '🏓 Pong !' });
            if (cmd === 'menu') {
                const menu = `╭━❰ SUHAIL-MD ❱━╮\n┃\n┃ 📌 .ping\n┃ 📌 .menu\n┃ 📌 .info\n┃ 📌 .tagall (groupes)\n┃\n╰━━━━━━━━━━━━━━╯`;
                await sock.sendMessage(from, { text: menu });
            }
            if (cmd === 'info') await sock.sendMessage(from, { text: `🤖 Bot : ${bot}\n📝 Préfixe : .\n⚡ Statut : ✅ Connecté` });
        } catch (e) { console.error('❌ Erreur message:', e); }
    });

    return sock;
}

// ===== LANCEMENT =====
startBot().catch(e => console.error('❌ Erreur fatale:', e));

// ===== SERVEUR WEB =====
const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('🚀 Suhail-MD is running'));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', connected: isConnected, uptime: process.uptime() }));
app.listen(PORT, () => console.log(`🌐 Serveur web sur le port ${PORT}`));

process.on('uncaughtException', (e) => console.error('💥 Exception:', e));
process.on('unhandledRejection', (e) => console.error('💥 Rejection:', e));

// ===== BOUCLE INFINIE DE SECOURS =====
// Empêche le processus de se terminer même si tout le reste plante
setInterval(() => {
    // Rien, juste pour garder le processus actif
}, 60000);

console.log('✅ Bot initialisé. Le processus reste actif indéfiniment.');
