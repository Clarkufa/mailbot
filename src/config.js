require('dotenv').config();

const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },
  imap: {
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT, 10) || 993,
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASSWORD,
    tls: process.env.IMAP_TLS !== 'false',
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 30000,
    connTimeout: 30000,
  },
  pollInterval: parseInt(process.env.POLL_INTERVAL, 10) || 60000,
  maxAttachmentSize: parseInt(process.env.MAX_ATTACHMENT_SIZE, 10) || 52428800,
};

// Validate required configuration
function validateConfig() {
  const required = [
    ['TELEGRAM_BOT_TOKEN', config.telegram.botToken],
    ['TELEGRAM_CHAT_ID', config.telegram.chatId],
    ['IMAP_HOST', config.imap.host],
    ['IMAP_USER', config.imap.user],
    ['IMAP_PASSWORD', config.imap.password],
  ];

  const missing = required.filter(([name, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = { config, validateConfig };
