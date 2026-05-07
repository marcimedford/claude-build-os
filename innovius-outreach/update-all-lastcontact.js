/**
 * update-all-lastcontact.js
 * Updates the Last Contact column (col L) for ALL of Marci's companies
 * using the last email date pulled from Affinity.
 */

import 'dotenv/config';
import fetch from 'node-fetch';
import { google } from 'googleapis';
import { readCompanies } from './sheets.js';

const AFFINITY_KEY = process.env.AFFINITY_API_KEY;
const encoded = Buffer.from(`:${AFFINITY_KEY}`).toString('base64');
const HEADERS = { Authorization: `Basic ${encoded}`, 'Content-Type': 'application/json' };

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

async function getAffinityLastEmail(domain) {
  try {
    const searchRes = await fetch(
      `https://api.affinity.co/organizations?term=${encodeURIComponent(domain)}&page_size=5`,
      { headers: HEADERS }
    );
    const searchData = await searchRes.json();
    const orgs = searchData.organizations || [];
    const org = orgs.find(o => (o.domains || []).some(d =>
      d.toLowerCase().includes(domain.split('.')[0].toLowerCase())
    )) || orgs[0];

    if (!org) return null;

    const orgRes = await fetch(
      `https://api.affinity.co/organizations/${org.id}?with_interaction_dates=true`,
      { headers: HEADERS }
    );
    const orgData = await orgRes.json();
    const dates = orgData.interaction_dates || {};

    return dates.last_email_date ? new Date(dates.last_email_date) : null;
  } catch {
    return null;
  }
}

function formatDate(d) {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

async function main() {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });

  console.log('Reading sheet...');
  const companies = await readCompanies();
  console.log(`Found ${companies.length} total companies\n`);

  const updates = [];
  let found = 0;
  let missing = 0;

  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    process.stdout.write(`[${i + 1}/${companies.length}] ${c.companyName}... `);

    if (!c.domain) {
      process.stdout.write('no domain, skipping\n');
      missing++;
      continue;
    }

    const lastEmail = await getAffinityLastEmail(c.domain);

    if (lastEmail) {
      const formatted = formatDate(lastEmail);
      process.stdout.write(`${formatted}\n`);
      updates.push({
        range: `${SHEET_NAME}!L${c.rowIndex}`,
        values: [[formatted]],
      });
      found++;
    } else {
      process.stdout.write('no email history\n');
      missing++;
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 150));
  }

  if (updates.length === 0) {
    console.log('\nNo dates to update.');
    return;
  }

  console.log(`\nWriting ${updates.length} updates to sheet...`);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: updates,
    },
  });

  console.log(`\n✓ Done! Updated ${found} companies, ${missing} had no Affinity data.`);
}

main().catch(console.error);
