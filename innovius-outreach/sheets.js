/**
 * sheets.js — Google Sheets read/write
 * Reads the company tracker and updates Last Emailed / Status columns.
 */

import 'dotenv/config';
import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.SHEETS_SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEETS_TAB_NAME || 'Outreach by person';

// Column index map (0-based) matching "Outreach by person" tab
// Col A (0) = blank, Col B (1) = #, Col C (2) = Company ...
// Row 1: title, Row 2: headers, Row 3: empty, Row 4+: section headers + data
const COLUMNS = {
  rowNum: 1,        // B
  companyName: 2,   // C
  cityState: 3,     // D
  priority: 4,      // E
  coScore: 5,       // F
  whoOwns: 6,       // G
  source: 7,        // H
  founderEmail: 8,  // I (Email)
  founderName: 9,   // J (CEO Name)
  status: 10,       // K
  lastContact: 11,  // L
  emailed: 12,      // M (Emailed?)
  linkedin: 13,     // N
  attendedPrev: 14, // O
  ceoLinkedin: 15,  // P
  campaignType: 16, // Q (Campaign Bucket)
  sender: 17,       // R (Sender Apollo)
  website: 18,      // S
  description: 19,  // T
};

function getAuth() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2;
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

/**
 * Read all companies from the tracker.
 * Returns array of company objects.
 */
export async function readCompanies() {
  const sheets = getSheetsClient();
  // Row 1 = title, Row 2 = headers, Row 3+ = data
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A3:T`,
  });

  const rows = res.data.values || [];
  const results = [];
  rows.forEach((row, i) => {
    const companyName = row[COLUMNS.companyName]?.trim();
    const rowNum = row[COLUMNS.rowNum]?.trim();
    // Skip blank rows and section header rows (section headers have text in col B but no number)
    if (!companyName || !rowNum || isNaN(Number(rowNum))) return;

    const website = row[COLUMNS.website]?.trim() || '';
    const domain = website.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0];
    const emailed = row[COLUMNS.emailed]?.trim() || '';
    const status = row[COLUMNS.status]?.trim() || '';

    results.push({
      rowIndex: i + 3, // sheet row = array index + 3 (rows 1,2,3 are title/header/blank)
      domain,
      companyName,
      cityState: row[COLUMNS.cityState]?.trim() || '',
      priority: row[COLUMNS.priority]?.trim() || '',
      whoOwns: row[COLUMNS.whoOwns]?.trim() || '',
      campaignTypeOverride: row[COLUMNS.campaignType]?.trim() || '',
      lastContact: row[COLUMNS.lastContact]?.trim() || '',
      emailed,
      status,
      website,
      description: row[COLUMNS.description]?.trim() || '',
      founderName: row[COLUMNS.founderName]?.trim() || '',
      founderEmail: row[COLUMNS.founderEmail]?.trim() || '',
      sender: row[COLUMNS.sender]?.trim() || '',
      hasResponse: ['attending', 'can\'t attend', 'responded', 'meeting booked']
        .includes(status.toLowerCase()),
      emailCount: emailed ? (emailed.match(/\d+x/) ? parseInt(emailed) : 1) : 0,
    });
  });
  return results;
}

/**
 * Update the Last Emailed and Status columns for a company row.
 */
/**
 * Update Last Contact (col K), Emailed? (col L), Status (col J) for a row.
 */
export async function updateCompanyStatus(rowIndex, { lastContact, emailed, status }) {
  const sheets = getSheetsClient();
  const today = lastContact || new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: `${SHEET_NAME}!J${rowIndex}`, values: [[status || 'Invite']] },
        { range: `${SHEET_NAME}!K${rowIndex}`, values: [[today]] },
        { range: `${SHEET_NAME}!L${rowIndex}`, values: [[emailed || '']] },
      ],
    },
  });
}

/**
 * Update the Campaign Bucket column (col P) after classification.
 */
export async function updateCampaignType(rowIndex, campaignType) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!P${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[campaignType]] },
  });
}
