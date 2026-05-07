/**
 * gmail.js — Gmail send / draft / thread-history logic
 */

import 'dotenv/config';
import { google } from 'googleapis';

const SENDER = process.env.GMAIL_SENDER || 'me';

function getAuth() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2;
}

function getGmailClient() {
  return google.gmail({ version: 'v1', auth: getAuth() });
}

/**
 * Build a raw RFC 2822 email message, base64url encoded.
 */
function buildRawMessage({ to, subject, body, threadId, inReplyTo, references }) {
  const lines = [
    `From: ${SENDER}`,
    `To: ${to}`,
    `Subject: ${subject}`,
  ];
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  lines.push('Content-Type: text/plain; charset=UTF-8');
  lines.push('');
  lines.push(body);

  const raw = lines.join('\r\n');
  return Buffer.from(raw).toString('base64url');
}

/**
 * Search for existing email threads with a domain/company.
 * Returns the most recent thread (or null).
 */
export async function findExistingThread(domain) {
  const gmail = getGmailClient();
  const query = `from:${domain} OR to:${domain}`;
  const res = await gmail.users.threads.list({
    userId: 'me',
    q: query,
    maxResults: 5,
  });

  const threads = res.data.threads || [];
  if (threads.length === 0) return null;

  // Get the most recent thread details
  const thread = await gmail.users.threads.get({
    userId: 'me',
    id: threads[0].id,
    format: 'metadata',
    metadataHeaders: ['Subject', 'Message-ID', 'Date'],
  });

  const messages = thread.data.messages || [];
  const lastMsg = messages[messages.length - 1];
  const headers = {};
  (lastMsg?.payload?.headers || []).forEach(h => { headers[h.name] = h.value; });

  return {
    threadId: thread.data.id,
    messageId: headers['Message-ID'],
    subject: headers['Subject'],
    date: headers['Date'],
    messageCount: messages.length,
  };
}

/**
 * Send Email 1 as a new thread immediately.
 * Returns { threadId, messageId }
 */
export async function sendEmail({ to, subject, body }) {
  const gmail = getGmailClient();
  const raw = buildRawMessage({ to, subject, body });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  return {
    threadId: res.data.threadId,
    messageId: res.data.id,
  };
}

/**
 * Save a follow-up email as a draft (threaded reply).
 * Returns the draft ID.
 */
export async function saveDraft({ to, subject, body, threadId, inReplyTo, references }) {
  const gmail = getGmailClient();
  const raw = buildRawMessage({ to, subject, body, threadId, inReplyTo, references });

  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw,
        threadId,
      },
    },
  });

  return res.data.id;
}

/**
 * Get email history for a domain: number of emails sent, any reply detected.
 */
export async function getEmailHistory(domain) {
  const gmail = getGmailClient();

  // Sent emails to this domain
  const sentRes = await gmail.users.messages.list({
    userId: 'me',
    q: `in:sent to:${domain}`,
    maxResults: 50,
  });
  const sentCount = (sentRes.data.messages || []).length;

  // Received replies from this domain
  const replyRes = await gmail.users.messages.list({
    userId: 'me',
    q: `from:${domain}`,
    maxResults: 10,
  });
  const hasResponse = (replyRes.data.messages || []).length > 0;

  return { sentCount, hasResponse };
}
