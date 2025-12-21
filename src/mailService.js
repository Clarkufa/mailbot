const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { config } = require('./config');

class MailService {
  constructor() {
    this.imap = null;
  }

  /**
   * Create a new IMAP connection
   */
  createConnection() {
    return new Imap(config.imap);
  }

  /**
   * Connect to IMAP server
   */
  connect() {
    return new Promise((resolve, reject) => {
      this.imap = this.createConnection();

      this.imap.once('ready', () => {
        console.log('[Mail] Connected to IMAP server');
        resolve();
      });

      this.imap.once('error', (err) => {
        console.error('[Mail] IMAP connection error:', err.message);
        reject(err);
      });

      this.imap.once('end', () => {
        console.log('[Mail] IMAP connection ended');
      });

      this.imap.connect();
    });
  }

  /**
   * Disconnect from IMAP server
   */
  disconnect() {
    return new Promise((resolve) => {
      if (this.imap) {
        this.imap.once('end', resolve);
        this.imap.end();
      } else {
        resolve();
      }
    });
  }

  /**
   * Open mailbox (inbox)
   */
  openInbox() {
    return new Promise((resolve, reject) => {
      this.imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          reject(err);
        } else {
          resolve(box);
        }
      });
    });
  }

  /**
   * Search for unread emails (returns UIDs)
   */
  searchUnread() {
    return new Promise((resolve, reject) => {
      // Use UID search for stable references
      this.imap.search(['UNSEEN'], (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results || []);
        }
      });
    });
  }

  /**
   * Fetch email by sequence number
   */
  fetchEmail(seqno) {
    return new Promise((resolve, reject) => {
      console.log(`[Mail] Fetching email #${seqno}...`);
      
      const fetch = this.imap.fetch(seqno, {
        bodies: '',
        struct: true,
        markSeen: false,
      });

      let messageFound = false;
      let parsePromise = null;
      let emailUid = seqno;

      fetch.on('message', (msg, seqNum) => {
        messageFound = true;
        
        msg.once('attributes', (attrs) => {
          emailUid = attrs.uid;
        });
        
        msg.on('body', (stream) => {
          parsePromise = simpleParser(stream)
            .then((parsed) => ({
              uid: emailUid,
              seqno: seqNum,
              from: parsed.from?.text || 'Unknown',
              to: parsed.to?.text || '',
              subject: parsed.subject || '(No Subject)',
              date: parsed.date || new Date(),
              text: parsed.text || '',
              html: parsed.html || '',
              attachments: (parsed.attachments || []).map((att) => ({
                filename: att.filename || 'attachment',
                contentType: att.contentType || 'application/octet-stream',
                size: att.size || 0,
                content: att.content,
              })),
            }))
            .catch((err) => {
              throw new Error(`Parse error: ${err.message}`);
            });
        });
      });

      fetch.once('error', (err) => {
        console.error(`[Mail] Fetch error for #${seqno}:`, err.message);
        reject(new Error(`Fetch error: ${err.message}`));
      });

      fetch.once('end', async () => {
        if (!messageFound) {
          console.warn(`[Mail] Email #${seqno} not found`);
          reject(new Error('Email not found (may have been deleted)'));
          return;
        }
        
        if (!parsePromise) {
          console.warn(`[Mail] Email #${seqno} has no body`);
          reject(new Error('No email body found'));
          return;
        }

        try {
          const emailData = await parsePromise;
          emailData.uid = emailUid; // Update with real UID
          console.log(`[Mail] Fetched email #${seqno} (UID: ${emailUid}): "${emailData.subject}"`);
          resolve(emailData);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Mark email as read/seen by UID
   */
  markAsRead(uid) {
    return new Promise((resolve, reject) => {
      // Use UID-based flag setting for reliability
      this.imap.addFlags(uid, ['\\Seen'], (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`[Mail] Email UID ${uid} marked as read`);
          resolve();
        }
      });
    });
  }

  /**
   * Fetch all unread emails
   */
  async fetchUnreadEmails() {
    const emails = [];

    try {
      await this.connect();
      await this.openInbox();

      const unreadSeqNos = await this.searchUnread();
      console.log(`[Mail] Found ${unreadSeqNos.length} unread email(s)`);

      if (unreadSeqNos.length === 0) {
        return emails;
      }

      // Fetch emails one by one with delay to ensure stability
      for (const seqno of unreadSeqNos) {
        try {
          const email = await this.fetchEmail(seqno);
          emails.push(email);
        } catch (err) {
          console.error(`[Mail] Error fetching email #${seqno}:`, err.message);
        }
        // Small delay between fetches
        await new Promise(r => setTimeout(r, 100));
      }
      
      console.log(`[Mail] Successfully fetched ${emails.length} of ${unreadSeqNos.length} emails`);
    } catch (err) {
      console.error('[Mail] Error in fetchUnreadEmails:', err.message);
    } finally {
      await this.disconnect();
    }

    return emails;
  }

  /**
   * Mark specific email as read (requires new connection)
   */
  async markEmailAsRead(uid) {
    try {
      await this.connect();
      await this.openInbox();
      await this.markAsRead(uid);
    } finally {
      await this.disconnect();
    }
  }
}

module.exports = { MailService };
