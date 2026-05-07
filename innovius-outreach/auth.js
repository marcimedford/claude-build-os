/**
 * auth.js — One-time Google OAuth2 token generator
 * Opens a browser, captures the auth code via localhost, saves refresh token to .env
 *
 * Usage: node auth.js
 */

import 'dotenv/config';
import { google } from 'googleapis';
import { readFileSync, writeFileSync } from 'fs';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const creds = JSON.parse(readFileSync(join(__dir, 'google-credentials.json'), 'utf8'));
const { client_id, client_secret } = creds.installed || creds.web;

const REDIRECT = 'http://localhost:3099';

const oauth2 = new google.auth.OAuth2(client_id, client_secret, REDIRECT);

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
];

const authUrl = oauth2.generateAuthUrl({ access_type: 'offline', scope: SCOPES });

console.log('\nOpening browser for Google authorization...');
console.log('\nIf it does not open automatically, paste this URL into Chrome:\n');
console.log(authUrl + '\n');

// Try to open the browser automatically
import('child_process').then(({ exec }) => {
  exec(`start "" "${authUrl}"`);
});

// Start a local server to catch the redirect
const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.end(`<h2>Error: ${error}</h2><p>Close this tab and try again.</p>`);
    server.close();
    return;
  }

  if (!code) {
    res.end('<h2>Waiting for authorization...</h2>');
    return;
  }

  try {
    const { tokens } = await oauth2.getToken(code);

    // Save to .env
    const envPath = join(__dir, '.env');
    let env = readFileSync(envPath, 'utf8');

    const set = (key, val) => {
      if (env.includes(`${key}=`)) {
        env = env.replace(new RegExp(`${key}=.*`), `${key}=${val}`);
      } else {
        env += `\n${key}=${val}`;
      }
    };

    set('GOOGLE_CLIENT_ID', client_id);
    set('GOOGLE_CLIENT_SECRET', client_secret);
    set('GOOGLE_REFRESH_TOKEN', tokens.refresh_token);
    writeFileSync(envPath, env);

    res.end('<h2>✓ Success! Google Sheets is connected.</h2><p>You can close this tab.</p>');
    console.log('\n✓ Credentials saved to .env — Google Sheets is ready!\n');
    server.close();
    process.exit(0);
  } catch (err) {
    res.end(`<h2>Error: ${err.message}</h2>`);
    server.close();
  }
});

server.listen(3099, () => {
  console.log('Waiting for Google to redirect back...\n');
});
