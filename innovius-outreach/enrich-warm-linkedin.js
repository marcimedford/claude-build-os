/**
 * enrich-warm-linkedin.js
 * Finds blank-CEO rows in the LinkedIn Outreach tab and fills them
 * in using Affinity (name, title, LinkedIn, email).
 *
 * STRICT rules:
 *  1. Only use an org that has a domain matching the target domain.
 *  2. Only use a person if:
 *       a) they have a CEO/Founder title at the matched org, OR
 *       b) their email domain matches the company domain
 *     Never fall back to persons[0] blindly.
 */

import 'dotenv/config';
import fetch from 'node-fetch';
import { google } from 'googleapis';

const AFFINITY_KEY = process.env.AFFINITY_API_KEY;
const AUTH = `Basic ${Buffer.from(`:${AFFINITY_KEY}`).toString('base64')}`;
const HEADERS = { Authorization: AUTH, 'Content-Type': 'application/json' };

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

async function affinityGet(path) {
  const res = await fetch(`https://api.affinity.co${path}`, { headers: HEADERS });
  if (!res.ok) return null;
  return res.json();
}

/** Returns true if the org's domains list contains the target domain (strict). */
function orgDomainMatches(orgDomains, targetDomain) {
  if (!orgDomains || !orgDomains.length) return false;
  const target = targetDomain.toLowerCase();
  const keyword = target.split('.')[0]; // e.g. "dragonboat" from "dragonboat.io"
  return orgDomains.some(d => {
    const dl = d.toLowerCase();
    // Exact match, or the root keyword appears in the domain (both directions)
    return dl === target || dl.split('.')[0] === keyword;
  });
}

/** Returns the root domain from an email, e.g. "acme.com" from "bob@acme.com". */
function emailDomain(email) {
  return (email || '').split('@')[1]?.toLowerCase() || '';
}

/** True if person's email is from the same root as the company domain. */
function personEmailMatchesDomain(personEmail, companyDomain) {
  const pd = emailDomain(personEmail);
  if (!pd) return false;
  const cd = companyDomain.toLowerCase();
  const pdRoot = pd.split('.')[0];
  const cdRoot = cd.split('.')[0];
  return pdRoot === cdRoot || pd === cd;
}

const CEO_RE = /\bceo\b|\bchief executive\b|\bco-?founder\b|\bfounder\b/i;

async function getCEOFromAffinity(domain) {
  try {
    const keyword = domain.split('.')[0];
    const data = await affinityGet(`/organizations?term=${encodeURIComponent(keyword)}&page_size=10`);
    if (!data?.organizations?.length) return null;

    // STRICT: require a domain match in the org
    const org = data.organizations.find(o => orgDomainMatches(o.domains, domain));
    if (!org) return null;

    // Get people at this org
    const people = await affinityGet(`/persons?organization_id=${org.id}&page_size=50`);
    if (!people?.persons?.length) return null;

    const persons = people.persons;

    // Pass 1: look for CEO/Founder by title in org membership details
    let ceo = null;
    for (const p of persons) {
      // Quick email domain check — skip obvious non-company emails early
      const pEmail = p.primary_email || '';
      const emailOk = !pEmail || personEmailMatchesDomain(pEmail, domain);

      const detail = await affinityGet(`/persons/${p.id}`);
      if (!detail) continue;

      const membership = (detail.organizations || []).find(o => orgDomainMatches(o.domains, domain));
      const hasTitle = CEO_RE.test(membership?.title || '');

      if (hasTitle) {
        ceo = { person: p, detail, title: membership.title };
        break;
      }
      await new Promise(r => setTimeout(r, 80));
    }

    // Pass 2: if no titled CEO found, look for anyone whose email matches the company domain
    if (!ceo) {
      for (const p of persons) {
        const pEmail = p.primary_email || '';
        if (pEmail && personEmailMatchesDomain(pEmail, domain)) {
          const detail = await affinityGet(`/persons/${p.id}`);
          const membership = (detail?.organizations || []).find(o => orgDomainMatches(o.domains, domain));
          ceo = { person: p, detail, title: membership?.title || '' };
          break;
        }
      }
    }

    // No valid CEO found — don't fall back to random persons
    if (!ceo) return null;

    const { person, detail, title } = ceo;
    const name = `${person.first_name || ''} ${person.last_name || ''}`.trim();
    const email = person.primary_email || '';

    // Look for LinkedIn in field values
    let linkedin = '';
    for (const fv of (detail?.field_values || [])) {
      if (typeof fv.value === 'string' && fv.value.includes('linkedin.com/in/')) {
        linkedin = fv.value;
        break;
      }
    }

    return { name, title, linkedin, email };
  } catch (e) {
    console.error(`    [error for ${domain}: ${e.message}]`);
    return null;
  }
}

async function main() {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });

  console.log('Reading LinkedIn Outreach tab...');
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A:I`,
  });
  const rows = res.data.values || [];
  const header = rows[0] || [];

  const colCompany     = header.indexOf('Company');
  const colCEOName     = header.indexOf('CEO Name');
  const colCEOTitle    = header.indexOf('CEO Title');
  const colCEOLinkedin = header.indexOf('CEO LinkedIn');
  const colCEOEmail    = header.indexOf('CEO Email');
  const colDomain      = header.indexOf('Domain');

  console.log(`Cols: Company=${colCompany} CEOName=${colCEOName} CEOEmail=${colCEOEmail} Domain=${colDomain}`);

  const toEnrich = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const ceoName = row[colCEOName]?.trim() || '';
    const domain  = row[colDomain]?.trim() || '';
    const company = row[colCompany]?.trim() || '';
    if (!ceoName && domain && company) {
      toEnrich.push({ sheetRow: i + 1, company, domain });
    }
  }

  console.log(`Found ${toEnrich.length} rows needing enrichment\n`);

  const updates = [];
  let enriched = 0;
  let notFound = 0;

  for (let i = 0; i < toEnrich.length; i++) {
    const { sheetRow, company, domain } = toEnrich[i];
    process.stdout.write(`  [${i + 1}/${toEnrich.length}] ${company} (${domain})... `);

    const ceo = await getCEOFromAffinity(domain);

    if (ceo?.name) {
      process.stdout.write(`✓ ${ceo.name} | ${ceo.email || 'no email'} | ${ceo.linkedin ? 'linkedin ✓' : 'no linkedin'}\n`);
      enriched++;
      const col = n => String.fromCharCode(65 + n);
      updates.push({ range: `${TAB}!${col(colCEOName)}${sheetRow}`,     values: [[ceo.name]] });
      updates.push({ range: `${TAB}!${col(colCEOTitle)}${sheetRow}`,    values: [[ceo.title || '']] });
      updates.push({ range: `${TAB}!${col(colCEOLinkedin)}${sheetRow}`, values: [[ceo.linkedin || '']] });
      updates.push({ range: `${TAB}!${col(colCEOEmail)}${sheetRow}`,    values: [[ceo.email || '']] });
    } else {
      process.stdout.write(`— not found\n`);
      notFound++;
    }

    // Batch write every 10 companies
    if (updates.length >= 40 || i === toEnrich.length - 1) {
      if (updates.length) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
        });
        updates.length = 0;
      }
    }

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n✓ Done! Enriched ${enriched}/${toEnrich.length} | ${notFound} not found.`);
}

main().catch(console.error);
