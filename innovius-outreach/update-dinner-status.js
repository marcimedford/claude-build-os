/**
 * update-dinner-status.js
 * Updates sheet status (col K) for companies that responded to the May 7th SF dinner invite.
 * - Can't come: Ediphi, GetPeer, Theo AI
 * - Attending (expressed interest): Spacial, EchoTwin
 * - Revert portco: ClearML (row 435 → clear status)
 */

import 'dotenv/config';
import { google } from 'googleapis';
import { readCompanies } from './sheets.js';

const SPREADSHEET_ID = process.env.SHEETS_SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEETS_TAB_NAME || 'Outreach by person';

function getAuth() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2;
}

const UPDATES = [
  // Can't come
  { domain: 'getpeer.ai',   name: 'GetPeer',   status: "Can't come" },
  { domain: 'ediphi.com',   name: 'Ediphi',    status: "Can't come" },
  { domain: 'theoai.ai',    name: 'Theo AI',   status: "Can't come" },
  // Attending / interested (not yet registered on Luma)
  { domain: 'spacial.io',   name: 'Spacial',   status: 'Attending' },
  { domain: 'echotwin.ai',  name: 'EchoTwin',  status: 'Attending' },
];

// ClearML is a portco — row 435, clear the "Registered" status we accidentally set
const PORTCO_CLEAR = { row: 435, name: 'ClearML (portco)' };

async function main() {
  const companies = await readCompanies();
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });

  const data = [];

  for (const u of UPDATES) {
    const match = companies.find(c =>
      c.domain?.toLowerCase().includes(u.domain.toLowerCase()) ||
      c.companyName?.toLowerCase().includes(u.name.toLowerCase())
    );

    if (match) {
      console.log(`✓ Found ${u.name} → row ${match.rowIndex}, setting K = "${u.status}"`);
      data.push({
        range: `${SHEET_NAME}!K${match.rowIndex}`,
        values: [[u.status]],
      });
    } else {
      console.log(`✗ Could not find ${u.name} (${u.domain}) in sheet`);
    }
  }

  // Clear ClearML (portco) status
  console.log(`✓ Clearing ClearML (portco) row ${PORTCO_CLEAR.row} status (K${PORTCO_CLEAR.row})`);
  data.push({
    range: `${SHEET_NAME}!K${PORTCO_CLEAR.row}`,
    values: [['']],
  });

  if (data.length === 0) {
    console.log('Nothing to update.');
    return;
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });

  console.log(`\n✓ Done! Applied ${data.length} status updates.`);
}

main().catch(console.error);
