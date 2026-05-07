/**
 * add-warm-linkedin.js
 *
 * 1. Reads warm companies (last contact > 3 months ago or none)
 * 2. Adds 5 manually specified companies
 * 3. Looks up CEO name, title, LinkedIn, email via Affinity
 * 4. Ensures "CEO Email" column exists in LinkedIn Outreach tab header
 * 5. Appends all new rows to the LinkedIn Outreach tab
 */

import 'dotenv/config';
import fetch from 'node-fetch';
import { google } from 'googleapis';
import { readCompanies } from './sheets.js';

const AFFINITY_KEY = process.env.AFFINITY_API_KEY;
const AUTH_HEADER = `Basic ${Buffer.from(`:${AFFINITY_KEY}`).toString('base64')}`;
const HEADERS = { Authorization: AUTH_HEADER, 'Content-Type': 'application/json' };

const SPREADSHEET_ID = process.env.SHEETS_SPREADSHEET_ID;
const TAB = 'LinkedIn Outreach';

function getAuth() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2;
}

const RESPONDED = [
  'registered', 'planning to attend', "can't attend",
  "can't come", "can't make it", 'attending', 'meeting booked',
];

// 5 manually added companies
const MANUAL_COMPANIES = [
  { companyName: 'Functional Finance', domain: 'functionalfinance.io', priority: '', campaignTypeOverride: 'Warm', cityState: '' },
  { companyName: 'VLM Run',           domain: 'vlm.run',              priority: '', campaignTypeOverride: 'Warm', cityState: '' },
  { companyName: 'Coram',             domain: 'coram.ai',             priority: '', campaignTypeOverride: 'Warm', cityState: '' },
  { companyName: 'Beacon.ai',         domain: 'beacon.ai',            priority: '', campaignTypeOverride: 'Warm', cityState: '' },
  { companyName: 'AmigoAI',           domain: 'amigoai.com',          priority: '', campaignTypeOverride: 'Warm', cityState: '' },
];

// ─── Affinity helpers ──────────────────────────────────────────────────────────

async function affinityGet(path) {
  const res = await fetch(`https://api.affinity.co${path}`, { headers: HEADERS });
  if (!res.ok) return null;
  return res.json();
}

async function findOrgInAffinity(domain) {
  // Try domain root (e.g. "dragonboat" from "dragonboat.io")
  const keyword = domain.split('.')[0];
  const data = await affinityGet(`/organizations?term=${encodeURIComponent(keyword)}&page_size=10`);
  if (!data?.organizations?.length) return null;

  // Prefer exact domain match
  const match = data.organizations.find(o =>
    (o.domains || []).some(d => d.toLowerCase().includes(keyword.toLowerCase()))
  ) || data.organizations[0];

  return match || null;
}

async function getCEOFromAffinity(domain) {
  try {
    const org = await findOrgInAffinity(domain);
    if (!org) return null;

    // Get people at this org
    const people = await affinityGet(`/persons?organization_id=${org.id}&page_size=50`);
    if (!people?.persons?.length) return null;

    // Look for CEO/Founder
    const ceoTitles = /\bceo\b|\bchief executive\b|\bco-?founder\b|\bfounder\b/i;
    const persons = people.persons;

    const ceo = persons.find(p => ceoTitles.test(p.primary_email_title || '') ||
                                   (p.organizations || []).some(o => ceoTitles.test(o.title || '')))
      || persons[0];

    if (!ceo) return null;

    // Get full person details for LinkedIn and email
    const detail = await affinityGet(`/persons/${ceo.id}`);

    // Extract LinkedIn from field values
    let linkedin = '';
    let title = '';
    let email = ceo.primary_email || '';
    const location = org.global_person_count > 0 ? '' : '';

    // Check field values for LinkedIn
    const fieldValues = detail?.field_values || [];
    for (const fv of fieldValues) {
      const val = fv.value;
      if (typeof val === 'string' && val.includes('linkedin.com/in/')) {
        linkedin = val;
      }
    }

    // Get title from org membership
    const orgMembership = (detail?.organizations || []).find(o =>
      (o.domains || []).some(d => d.toLowerCase().includes(domain.split('.')[0].toLowerCase()))
    );
    if (orgMembership?.title) title = orgMembership.title;

    const name = `${ceo.first_name || ''} ${ceo.last_name || ''}`.trim();
    const city = org.city || '';

    return { name, title, linkedin, email, city };
  } catch (e) {
    return null;
  }
}

async function main() {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });

  // ── 1. Read and filter warm companies ────────────────────────────────────────
  console.log('Reading sheet...');
  const allCompanies = await readCompanies();
  const cutoff = new Date('2026-02-01');

  const warmFromSheet = allCompanies.filter(c => {
    if (!c.campaignTypeOverride?.toLowerCase().includes('warm')) return false;
    if (RESPONDED.includes(c.status?.toLowerCase())) return false;
    if (!c.lastContact) return true;
    const d = new Date(c.lastContact);
    return isNaN(d) || d < cutoff;
  });

  console.log(`${warmFromSheet.length} qualifying warm companies + ${MANUAL_COMPANIES.length} manual`);

  const targets = [...warmFromSheet, ...MANUAL_COMPANIES];

  // ── 2. Check existing rows to skip duplicates ─────────────────────────────────
  const existingRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A:A`,
  });
  const existingNames = new Set(
    (existingRes.data.values || []).slice(1).map(r => r[0]?.toLowerCase().trim())
  );

  // ── 3. Ensure header has CEO Email column ─────────────────────────────────────
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A1:J1`,
  });
  const currentHeader = headerRes.data.values?.[0] || [];
  if (!currentHeader.includes('CEO Email')) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TAB}!A1:I1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Company', 'Priority', 'Location', 'CEO Name', 'CEO Title', 'CEO LinkedIn', 'CEO Email', 'Domain', 'Campaign']],
      },
    });
    console.log('Updated header to include CEO Email');
  }

  // ── 4. Look up CEO via Affinity for each company ──────────────────────────────
  const rows = [];

  for (let i = 0; i < targets.length; i++) {
    const c = targets[i];
    const nameKey = c.companyName?.toLowerCase().trim();

    if (!nameKey || existingNames.has(nameKey)) {
      process.stdout.write(`  [${i + 1}/${targets.length}] ${c.companyName} — already in tab, skipping\n`);
      continue;
    }

    process.stdout.write(`  [${i + 1}/${targets.length}] ${c.companyName}... `);

    let ceo = null;
    if (c.domain) {
      ceo = await getCEOFromAffinity(c.domain);
    }

    const location = c.cityState || ceo?.city || '';

    if (ceo?.name) {
      process.stdout.write(`${ceo.name} | ${ceo.email || 'no email'} | ${ceo.linkedin || 'no linkedin'}\n`);
    } else {
      process.stdout.write(`not found in Affinity\n`);
    }

    rows.push([
      c.companyName,
      c.priority || '',
      location,
      ceo?.name || '',
      ceo?.title || '',
      ceo?.linkedin || '',
      ceo?.email || '',
      c.domain || '',
      c.campaignTypeOverride || '',
    ]);

    await new Promise(r => setTimeout(r, 250));
  }

  if (!rows.length) {
    console.log('\nNo new rows to add.');
    return;
  }

  // ── 5. Append rows ────────────────────────────────────────────────────────────
  console.log(`\nAppending ${rows.length} new rows...`);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  const withLinkedIn = rows.filter(r => r[5]).length;
  const withEmail    = rows.filter(r => r[6]).length;
  console.log(`\n✓ Done! Appended ${rows.length} rows.`);
  console.log(`  ${withLinkedIn} with LinkedIn | ${withEmail} with email | ${rows.length - withLinkedIn} no match`);
}

main().catch(console.error);
