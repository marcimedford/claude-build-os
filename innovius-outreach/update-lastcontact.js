/**
 * update-lastcontact.js
 * Updates the Last Contact column in the sheet for all pending-followups companies
 * using the lastEmail date from Affinity (already stored in pending-followups.json).
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.SHEETS_SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEETS_TAB_NAME || 'Outreach by person';

// Last Contact = col L (index 11), which is col L in the sheet = column 12 (1-based)
const COL_LAST_CONTACT = 'L';

function getAuth() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2;
}

function formatDate(isoDateStr) {
  // Convert "2026-04-17" → "4/17/2026"
  const d = new Date(isoDateStr + 'T12:00:00Z');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
}

async function main() {
  const companies = JSON.parse(readFileSync('./pending-followups.json', 'utf8'));
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });

  // Build batch update data
  const data = [];
  for (const c of companies) {
    if (!c.lastEmail) {
      console.log(`  ⚠ ${c.companyName} — no lastEmail, skipping`);
      continue;
    }
    const formatted = formatDate(c.lastEmail);
    data.push({
      range: `${SHEET_NAME}!${COL_LAST_CONTACT}${c.rowIndex}`,
      values: [[formatted]],
    });
  }

  if (data.length === 0) {
    console.log('Nothing to update.');
    return;
  }

  console.log(`Updating Last Contact for ${data.length} companies...`);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });

  console.log('\nDone! Updated rows:');
  for (const c of companies) {
    if (c.lastEmail) {
      console.log(`  ✓ ${c.companyName} → ${formatDate(c.lastEmail)} (row ${c.rowIndex})`);
    }
  }
}

main().catch(console.error);
