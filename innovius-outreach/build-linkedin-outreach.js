/**
 * build-linkedin-outreach.js
 * Finds CEO name + LinkedIn URL for all High/Medium priority Cold companies
 * using Apollo, then writes a new "LinkedIn Outreach" tab in the sheet.
 */

import 'dotenv/config';
import fetch from 'node-fetch';
import { google } from 'googleapis';
import { readCompanies } from './sheets.js';

const APOLLO_KEY = process.env.APOLLO_API_KEY;
const SPREADSHEET_ID = process.env.SHEETS_SPREADSHEET_ID;

function getAuth() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2;
}

const RESPONDED = ['registered','planning to attend',"can't attend","can't come","can't make it",'attending','meeting booked'];

async function searchCEO(domain) {
  try {
    const body = {
      api_key: APOLLO_KEY,
      q_organization_domains_list: [domain],
      person_titles: ['CEO', 'Co-Founder', 'Founder', 'Chief Executive Officer'],
      person_seniorities: ['c_suite', 'founder'],
      include_similar_titles: false,
      per_page: 5,
    };

    const res = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    const people = data.people || [];

    // Prefer CEO title, then Co-Founder/Founder
    const ceo = people.find(p => /\bceo\b|\bchief executive\b/i.test(p.title || ''))
      || people.find(p => /\bco-founder\b|\bcofounder\b|\bfounder\b/i.test(p.title || ''))
      || people[0];

    if (!ceo) return null;

    return {
      name: `${ceo.first_name || ''} ${ceo.last_name || ''}`.trim(),
      title: ceo.title || '',
      linkedin: ceo.linkedin_url || '',
      city: ceo.city || '',
      state: ceo.state || '',
      country: ceo.country || '',
    };
  } catch (e) {
    return null;
  }
}

async function ensureTab(sheets, tabName) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = meta.data.sheets.some(s => s.properties.title === tabName);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabName } } }],
      },
    });
    console.log(`Created tab: ${tabName}`);
  } else {
    console.log(`Tab already exists: ${tabName}`);
  }
}

async function main() {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const TAB = 'LinkedIn Outreach';

  console.log('Reading companies...');
  const companies = await readCompanies();

  const targets = companies.filter(c => {
    const pri = (c.priority || '').toLowerCase();
    const camp = (c.campaignTypeOverride || '').toLowerCase();
    const status = (c.status || '').toLowerCase();
    return (pri === 'high' || pri === 'medium')
      && camp.includes('cold')
      && !RESPONDED.includes(status);
  });

  console.log(`Found ${targets.length} companies to process\n`);

  const rows = [];

  for (let i = 0; i < targets.length; i++) {
    const c = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${c.companyName}... `);

    const ceo = await searchCEO(c.domain);

    const location = c.cityState || (ceo ? [ceo.city, ceo.state].filter(Boolean).join(', ') : '');
    const ceoName = ceo?.name || '';
    const ceoTitle = ceo?.title || '';
    const linkedinUrl = ceo?.linkedin || '';

    if (ceo) {
      process.stdout.write(`${ceoName} — ${linkedinUrl || 'no linkedin'}\n`);
    } else {
      process.stdout.write(`not found\n`);
    }

    rows.push([
      c.companyName,
      c.priority,
      location,
      ceoName,
      ceoTitle,
      linkedinUrl,
      c.domain,
      c.campaignTypeOverride,
    ]);

    // Respect Apollo rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  // Ensure tab exists
  await ensureTab(sheets, TAB);

  // Write header + data
  const header = [['Company', 'Priority', 'Location', 'CEO Name', 'CEO Title', 'CEO LinkedIn', 'Domain', 'Campaign']];
  const allRows = [...header, ...rows];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: allRows },
  });

  const withLinkedIn = rows.filter(r => r[5]).length;
  console.log(`\n✓ Done! Written ${rows.length} rows to "${TAB}" tab.`);
  console.log(`  ${withLinkedIn} have a CEO LinkedIn URL, ${rows.length - withLinkedIn} had no match.`);
}

main().catch(console.error);
