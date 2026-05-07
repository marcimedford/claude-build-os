/**
 * sync.js — Full status sync for Marci's companies
 *
 * For each company:
 * 1. Pulls last email date from Affinity
 * 2. Updates Last Contact + Emailed? in the sheet
 * 3. Reports who needs follow-ups
 */

import 'dotenv/config';
import fetch from 'node-fetch';
import { readCompanies, updateCompanyStatus } from './sheets.js';

const AFFINITY_KEY = process.env.AFFINITY_API_KEY;
const encoded = Buffer.from(`:${AFFINITY_KEY}`).toString('base64');
const HEADERS = { Authorization: `Basic ${encoded}`, 'Content-Type': 'application/json' };

async function getAffinityDates(domain) {
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

    return {
      firstEmail: dates.first_email_date ? new Date(dates.first_email_date) : null,
      lastEmail:  dates.last_email_date  ? new Date(dates.last_email_date)  : null,
    };
  } catch {
    return null;
  }
}

function formatDate(d) {
  if (!d) return null;
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function daysSince(d) {
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

async function main() {
  console.log('Reading sheet...');
  const all = await readCompanies();
  const companies = all.filter(c => c.whoOwns?.includes('Marci'));
  console.log(`Found ${companies.length} Marci companies\n`);

  const results = {
    needsFollowUp: [],    // emailed, no reply, < 4 emails
    cannotBreakIn: [],    // emailed 4+ times, no reply
    responded: [],        // has a response
    notEmailed: [],       // never emailed
    updated: 0,
  };

  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    process.stdout.write(`[${i + 1}/${companies.length}] ${c.companyName}... `);

    if (!c.domain) {
      process.stdout.write('no domain\n');
      continue;
    }

    // Get Affinity dates
    const dates = await getAffinityDates(c.domain);
    const lastEmail = dates?.lastEmail;
    const firstEmail = dates?.firstEmail;

    // Determine email count from sheet emailed field
    const emailedText = c.emailed || '';
    let emailCount = 0;
    if (emailedText) {
      const match = emailedText.match(/(\d+)x/);
      emailCount = match ? parseInt(match[1]) : 1;
    }

    // Classify
    const hasReply = c.hasResponse;
    const wasEmailed = !!lastEmail || !!emailedText;

    if (hasReply) {
      results.responded.push({ ...c, lastEmail });
    } else if (!wasEmailed) {
      results.notEmailed.push({ ...c, lastEmail });
    } else if (emailCount >= 4) {
      results.cannotBreakIn.push({ ...c, lastEmail, emailCount });
    } else {
      results.needsFollowUp.push({ ...c, lastEmail, emailCount });
    }

    // Update sheet if Affinity has a newer/better date than sheet
    if (lastEmail) {
      const affinityDateStr = formatDate(lastEmail);
      const daysAgo = daysSince(lastEmail);

      // Only update if the sheet emailed field is empty or we have affinity data
      if (!emailedText && affinityDateStr) {
        try {
          await updateCompanyStatus(c.rowIndex, {
            lastContact: affinityDateStr,
            emailed: `Emailed (last ${affinityDateStr})`,
            status: c.status || 'Invite',
          });
          results.updated++;
        } catch (e) {
          // skip write errors silently
        }
      }
      process.stdout.write(`last email ${daysAgo}d ago\n`);
    } else {
      process.stdout.write('no email history in Affinity\n');
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 150));
  }

  // Print summary
  console.log('\n' + '═'.repeat(60));
  console.log('SYNC COMPLETE');
  console.log('═'.repeat(60));
  console.log(`Sheet rows updated: ${results.updated}`);

  console.log(`\n✅ RESPONDED (${results.responded.length}) — no action needed:`);
  results.responded.forEach(c => console.log(`   ${c.companyName} (${c.status})`));

  console.log(`\n⚠️  NEEDS FOLLOW-UP (${results.needsFollowUp.length}) — emailed, no reply:`);
  results.needsFollowUp
    .sort((a, b) => (a.lastEmail || 0) - (b.lastEmail || 0))
    .forEach(c => console.log(`   ${c.companyName} — last email: ${formatDate(c.lastEmail) || 'unknown'}, ~${c.emailCount} email(s)`));

  console.log(`\n🚫 CANNOT BREAK IN (${results.cannotBreakIn.length}) — 4+ emails, no reply:`);
  results.cannotBreakIn.forEach(c => console.log(`   ${c.companyName} — ${c.emailCount} emails`));

  console.log(`\n📭 NEVER EMAILED (${results.notEmailed.length}):`);
  results.notEmailed.slice(0, 20).forEach(c => console.log(`   ${c.companyName}`));
  if (results.notEmailed.length > 20) console.log(`   ...and ${results.notEmailed.length - 20} more`);

  console.log('\n' + '═'.repeat(60));

  return results;
}

main().catch(console.error);
