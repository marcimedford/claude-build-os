/**
 * index.js — Innovius Outreach Automation
 *
 * Usage:
 *   node index.js --mode=review
 *   node index.js --type=net_new --output=apollo_csv
 *   node index.js --type=warm --output=gmail
 *   node index.js --company=olli_health --output=review
 *   node index.js --output=review --all
 */

import 'dotenv/config';
import minimist from 'minimist';
import chalk from 'chalk';
import { select, confirm } from '@inquirer/prompts';

import { readCompanies, updateCompanyStatus, updateCampaignType } from './sheets.js';
import { getAffinityProfile } from './affinity.js';
import { getEmailHistory, sendEmail, saveDraft, findExistingThread } from './gmail.js';
import { classifyCompany, CAMPAIGN_EMAIL_COUNTS } from './classify.js';
import { generateCampaign } from './generate.js';
import { exportToApollo } from './apollo.js';

const args = minimist(process.argv.slice(2));

const MODE    = args.mode   || 'review';     // review | send
const TYPE    = args.type   || null;          // net_new | warm | cannot_break_in | re_engage | null=all
const OUTPUT  = args.output || 'review';      // review | apollo_csv | gmail
const COMPANY = args.company || null;         // slug filter, e.g. "olli_health"
const ALL     = args.all    || false;

// ─── Utilities ────────────────────────────────────────────────────────────────

function log(msg) { console.log(msg); }
function header(msg) { log(chalk.bold.cyan(`\n${'─'.repeat(60)}\n${msg}\n${'─'.repeat(60)}`)); }
function success(msg) { log(chalk.green('✓ ' + msg)); }
function warn(msg) { log(chalk.yellow('⚠ ' + msg)); }
function error(msg) { log(chalk.red('✗ ' + msg)); }

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function printCampaign(company, campaignType, campaign) {
  header(`${company.companyName} — ${campaignType}`);
  const count = CAMPAIGN_EMAIL_COUNTS[campaignType];
  for (let i = 1; i <= count; i++) {
    const email = campaign[`email_${i}`];
    if (!email) continue;
    log(chalk.bold(`\nEmail ${i}`));
    log(chalk.dim(`Subject: ${email.subject}`));
    log(email.body);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log(chalk.bold.magenta('\n🚀 Innovius Outreach Automation'));
  log(`Mode: ${OUTPUT} | Filter: ${TYPE || 'all'} | ${COMPANY ? `Company: ${COMPANY}` : 'All companies'}\n`);

  // 1. Read company tracker from Google Sheets
  log('Reading company tracker from Google Sheets...');
  let companies = await readCompanies();
  log(`  Found ${companies.length} companies`);

  // 2. Filter by --company flag
  if (COMPANY) {
    companies = companies.filter(c => slugify(c.companyName) === slugify(COMPANY) || slugify(c.domain) === slugify(COMPANY));
    if (companies.length === 0) {
      error(`No company found matching: ${COMPANY}`);
      process.exit(1);
    }
  }

  // 3. Enrich each company with Affinity + Gmail data, classify
  log('Enriching with Affinity + Gmail data...');
  const enriched = [];

  for (const company of companies) {
    process.stdout.write(`  ${company.companyName}... `);

    // Gmail history
    let emailCount = company.emailCount;
    let hasResponse = company.hasResponse;
    try {
      const gmailHistory = await getEmailHistory(company.domain);
      // Use max of sheet count vs Gmail count (Gmail is source of truth)
      emailCount = Math.max(emailCount, gmailHistory.sentCount);
      hasResponse = hasResponse || gmailHistory.hasResponse;
    } catch {
      // Gmail not configured or failed — use sheet data
    }

    // Affinity profile
    let affinityProfile = null;
    try {
      affinityProfile = await getAffinityProfile(company.domain);
    } catch {
      // Affinity not configured or failed — skip
    }

    const campaignType = classifyCompany({
      lastContactAffinity: affinityProfile?.lastContactDate || null,
      emailCount,
      hasResponse,
      campaignTypeOverride: company.campaignTypeOverride,
    });

    process.stdout.write(chalk.dim(`${campaignType}\n`));
    enriched.push({ company: { ...company, emailCount, hasResponse }, campaignType, affinityProfile });
  }

  // 4. Filter by --type flag
  let filtered = enriched;
  if (TYPE) {
    const typeMap = {
      net_new: 'NET_NEW',
      warm: 'WARM',
      cannot_break_in: 'CANNOT_BREAK_IN',
      re_engage: 'RE_ENGAGE',
    };
    const target = typeMap[TYPE.toLowerCase()] || TYPE.toUpperCase();
    filtered = enriched.filter(e => e.campaignType === target);
    log(`\nFiltered to ${filtered.length} ${target} companies`);
  }

  if (filtered.length === 0) {
    warn('No companies match the current filter. Try --all or change --type.');
    return;
  }

  // 5. Generate campaigns
  log(`\nGenerating ${filtered.length} email campaign(s) via Claude...\n`);
  const results = [];

  for (const { company, campaignType, affinityProfile } of filtered) {
    log(`  Generating: ${chalk.bold(company.companyName)} (${campaignType})`);
    try {
      const campaign = await generateCampaign(company, campaignType, affinityProfile);
      results.push({ company, campaignType, campaign });
    } catch (err) {
      error(`  Failed for ${company.companyName}: ${err.message}`);
    }
  }

  // 6. Output
  if (OUTPUT === 'review' || MODE === 'review') {
    for (const { company, campaignType, campaign } of results) {
      printCampaign(company, campaignType, campaign);

      if (OUTPUT === 'gmail') {
        // In review+gmail mode: ask per company before sending
        const action = await select({
          message: `What do you want to do with ${company.companyName}?`,
          choices: [
            { name: 'Send Email 1 now + save 2-N as drafts', value: 'send' },
            { name: 'Save all as drafts', value: 'drafts' },
            { name: 'Skip this company', value: 'skip' },
          ],
        });

        if (action === 'send' || action === 'drafts') {
          await sendCampaignViaGmail(company, campaignType, campaign, action === 'send');
        }
      }
    }

    if (OUTPUT === 'apollo_csv') {
      const ok = await confirm({ message: `Export all ${results.length} campaigns to Apollo CSV?`, default: true });
      if (ok) {
        const path = await exportToApollo(results, '.');
        success(`Apollo CSV saved: ${path}`);
      }
    }

  } else if (OUTPUT === 'apollo_csv') {
    const path = await exportToApollo(results, '.');
    success(`Apollo CSV saved: ${path}`);

  } else if (OUTPUT === 'gmail') {
    for (const { company, campaignType, campaign } of results) {
      printCampaign(company, campaignType, campaign);
      await sendCampaignViaGmail(company, campaignType, campaign, true);
    }
  }

  log(chalk.bold.green('\n✓ Done\n'));
}

// ─── Gmail send helper ────────────────────────────────────────────────────────

async function sendCampaignViaGmail(company, campaignType, campaign, sendFirst) {
  const to = company.founderEmail;
  if (!to) {
    warn(`No email address for ${company.companyName} — skipping Gmail send`);
    return;
  }

  const email1 = campaign.email_1;
  let threadId, firstMessageId;

  if (sendFirst) {
    log(`  Sending Email 1 to ${to}...`);
    const sent = await sendEmail({ to, subject: email1.subject, body: email1.body });
    threadId = sent.threadId;
    firstMessageId = sent.messageId;
    success(`  Sent. Thread ID: ${threadId}`);
  } else {
    log(`  Saving Email 1 as draft for ${to}...`);
    const draftId = await saveDraft({ to, subject: email1.subject, body: email1.body });
    success(`  Draft saved: ${draftId}`);
  }

  // Save follow-ups as drafts
  const count = CAMPAIGN_EMAIL_COUNTS[campaignType];
  for (let i = 2; i <= count; i++) {
    const followUp = campaign[`email_${i}`];
    if (!followUp) continue;
    const draftId = await saveDraft({
      to,
      subject: `Re: ${email1.subject}`,
      body: followUp.body,
      threadId,
      inReplyTo: firstMessageId,
      references: firstMessageId,
    });
    success(`  Draft ${i} saved: ${draftId}`);
  }

  // Update Google Sheet
  try {
    await updateCompanyStatus(company.rowIndex, {
      lastEmailed: new Date().toISOString().split('T')[0],
      emailCount: (company.emailCount || 0) + 1,
      status: sendFirst ? 'Emailed' : 'Drafted',
    });
    await updateCampaignType(company.rowIndex, campaignType);
    success(`  Sheet updated for ${company.companyName}`);
  } catch (err) {
    warn(`  Could not update sheet: ${err.message}`);
  }
}

main().catch(err => {
  console.error(chalk.red('\nFatal error:'), err);
  process.exit(1);
});
