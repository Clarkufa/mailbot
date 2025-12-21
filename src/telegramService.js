const TelegramBot = require('node-telegram-bot-api');
const { config } = require('./config');

class TelegramService {
  constructor() {
    this.bot = new TelegramBot(config.telegram.botToken, { polling: false });
    this.chatId = config.telegram.chatId;
    this.maxAttachmentSize = config.maxAttachmentSize;
  }

  /**
   * Escape special characters for Telegram HTML
   */
  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Truncate text to specified length
   */
  truncateText(text, maxLength = 4000) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '\n\n... [truncated]';
  }

  /**
   * Format email message for Telegram
   */
  formatEmailMessage(email) {
    const date = email.date instanceof Date
      ? email.date.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
      : String(email.date);

    const attachmentInfo = email.attachments.length > 0
      ? `\n📎 <b>Attachments:</b> ${email.attachments.length}`
      : '';

    const bodyText = this.truncateText(email.text || '(No text content)', 3000);

    return `📧 <b>New Email</b>\n\n` +
      `<b>From:</b> ${this.escapeHtml(email.from)}\n` +
      `<b>To:</b> ${this.escapeHtml(email.to)}\n` +
      `<b>Subject:</b> ${this.escapeHtml(email.subject)}\n` +
      `<b>Date:</b> ${this.escapeHtml(date)}` +
      `${attachmentInfo}\n\n` +
      `<b>Message:</b>\n${this.escapeHtml(bodyText)}`;
  }

  /**
   * Send text message to Telegram
   */
  async sendMessage(text) {
    try {
      await this.bot.sendMessage(this.chatId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
      return true;
    } catch (err) {
      console.error('[Telegram] Error sending message:', err.message);
      throw err;
    }
  }

  /**
   * Send document/attachment to Telegram
   */
  async sendDocument(buffer, filename, caption = '') {
    try {
      await this.bot.sendDocument(
        this.chatId,
        buffer,
        {
          caption: caption.substring(0, 1024),
          parse_mode: 'HTML',
        },
        {
          filename,
          contentType: 'application/octet-stream',
        }
      );
      return true;
    } catch (err) {
      console.error(`[Telegram] Error sending document ${filename}:`, err.message);
      throw err;
    }
  }

  /**
   * Send complete email with attachments
   */
  async sendEmail(email) {
    console.log(`[Telegram] Sending email: "${email.subject}" from ${email.from}`);

    // Send main message
    const messageText = this.formatEmailMessage(email);
    await this.sendMessage(messageText);

    // Send attachments
    for (const attachment of email.attachments) {
      if (attachment.size > this.maxAttachmentSize) {
        await this.sendMessage(
          `⚠️ <b>Skipped attachment:</b> ${this.escapeHtml(attachment.filename)}\n` +
          `<i>Size ${(attachment.size / 1024 / 1024).toFixed(2)} MB exceeds limit</i>`
        );
        continue;
      }

      if (!attachment.content) {
        console.warn(`[Telegram] Attachment ${attachment.filename} has no content`);
        continue;
      }

      const caption = `📎 ${this.escapeHtml(attachment.filename)}`;

      try {
        await this.sendDocument(attachment.content, attachment.filename, caption);
        console.log(`[Telegram] Sent attachment: ${attachment.filename}`);
      } catch (err) {
        console.error(`[Telegram] Failed to send attachment ${attachment.filename}:`, err.message);
        // Try to notify about failed attachment
        try {
          await this.sendMessage(
            `⚠️ <b>Failed to send attachment:</b> ${this.escapeHtml(attachment.filename)}\n` +
            `<i>Error: ${this.escapeHtml(err.message)}</i>`
          );
        } catch {
          // Ignore notification errors
        }
      }

      // Small delay between attachments to avoid rate limiting
      await this.delay(500);
    }

    console.log(`[Telegram] Email sent successfully: "${email.subject}"`);
    return true;
  }

  /**
   * Delay utility
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Test connection by getting bot info
   */
  async testConnection() {
    try {
      const me = await this.bot.getMe();
      console.log(`[Telegram] Bot connected: @${me.username}`);
      return true;
    } catch (err) {
      console.error('[Telegram] Connection test failed:', err.message);
      throw err;
    }
  }
}

module.exports = { TelegramService };
