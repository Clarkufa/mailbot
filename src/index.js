const { config, validateConfig } = require('./config');
const { MailService } = require('./mailService');
const { TelegramService } = require('./telegramService');

class MailBot {
  constructor() {
    this.mailService = new MailService();
    this.telegramService = new TelegramService();
    this.isRunning = false;
    this.pollTimeout = null;
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 5;
  }

  /**
   * Process single email: send to Telegram and mark as read
   */
  async processEmail(email) {
    try {
      // Send email to Telegram
      await this.telegramService.sendEmail(email);

      // Mark as read only after successful send
      await this.mailService.markEmailAsRead(email.uid);

      console.log(`[Bot] Successfully processed email UID ${email.uid}: "${email.subject}"`);
      return true;
    } catch (err) {
      console.error(`[Bot] Failed to process email UID ${email.uid}:`, err.message);
      return false;
    }
  }

  /**
   * Check for new emails and process them
   */
  async checkEmails() {
    console.log('[Bot] Checking for new emails...');

    try {
      const emails = await this.mailService.fetchUnreadEmails();

      if (emails.length === 0) {
        console.log('[Bot] No new emails');
        this.consecutiveErrors = 0;
        return;
      }

      console.log(`[Bot] Processing ${emails.length} email(s)...`);

      let successCount = 0;
      let failCount = 0;

      for (const email of emails) {
        const success = await this.processEmail(email);
        if (success) {
          successCount++;
        } else {
          failCount++;
        }

        // Small delay between emails to avoid rate limiting
        await this.delay(1000);
      }

      console.log(`[Bot] Processed: ${successCount} success, ${failCount} failed`);
      this.consecutiveErrors = 0;
    } catch (err) {
      console.error('[Bot] Error checking emails:', err.message);
      this.consecutiveErrors++;

      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        console.error(`[Bot] Too many consecutive errors (${this.consecutiveErrors}). Waiting longer...`);
      }
    }
  }

  /**
   * Calculate next poll interval with exponential backoff on errors
   */
  getNextPollInterval() {
    if (this.consecutiveErrors === 0) {
      return config.pollInterval;
    }

    // Exponential backoff: double the interval for each consecutive error, max 10 minutes
    const backoffMultiplier = Math.min(Math.pow(2, this.consecutiveErrors - 1), 10);
    const interval = config.pollInterval * backoffMultiplier;
    const maxInterval = 10 * 60 * 1000; // 10 minutes

    return Math.min(interval, maxInterval);
  }

  /**
   * Schedule next poll
   */
  scheduleNextPoll() {
    if (!this.isRunning) return;

    const interval = this.getNextPollInterval();
    console.log(`[Bot] Next check in ${Math.round(interval / 1000)} seconds`);

    this.pollTimeout = setTimeout(async () => {
      await this.checkEmails();
      this.scheduleNextPoll();
    }, interval);
  }

  /**
   * Start the bot
   */
  async start() {
    console.log('[Bot] Starting Mail-to-Telegram Bot...');
    console.log(`[Bot] Poll interval: ${config.pollInterval / 1000} seconds`);

    // Test Telegram connection
    await this.telegramService.testConnection();

    // Send startup notification
    try {
      await this.telegramService.sendMessage(
        '🤖 <b>Mail Bot Started</b>\n\n' +
        `Monitoring: ${config.imap.user}\n` +
        `Poll interval: ${config.pollInterval / 1000} seconds`
      );
    } catch (err) {
      console.warn('[Bot] Could not send startup notification:', err.message);
    }

    this.isRunning = true;

    // Initial check
    await this.checkEmails();

    // Start polling loop
    this.scheduleNextPoll();

    console.log('[Bot] Bot is now running. Press Ctrl+C to stop.');
  }

  /**
   * Stop the bot
   */
  async stop() {
    console.log('[Bot] Stopping bot...');
    this.isRunning = false;

    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    // Send shutdown notification
    try {
      await this.telegramService.sendMessage('🔴 <b>Mail Bot Stopped</b>');
    } catch (err) {
      console.warn('[Bot] Could not send shutdown notification:', err.message);
    }

    console.log('[Bot] Bot stopped');
  }

  /**
   * Delay utility
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Main entry point
async function main() {
  try {
    // Validate configuration
    validateConfig();

    const bot = new MailBot();

    // Handle graceful shutdown
    const shutdown = async () => {
      await bot.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Handle uncaught errors
    process.on('uncaughtException', (err) => {
      console.error('[Bot] Uncaught exception:', err);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[Bot] Unhandled rejection at:', promise, 'reason:', reason);
    });

    // Start the bot
    await bot.start();
  } catch (err) {
    console.error('[Bot] Fatal error:', err.message);
    process.exit(1);
  }
}

main();
