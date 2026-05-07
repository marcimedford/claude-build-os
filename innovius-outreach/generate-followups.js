/**
 * generate-followups.js
 * Generates personal follow-up emails for all pending companies, grouped by owner.
 * Uses claude -p (Claude Code CLI) — no API key needed.
 */

import 'dotenv/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync } from 'fs';

const execFileAsync = promisify(execFile);
const companies = JSON.parse(readFileSync('./pending-followups.json', 'utf8'));

// Group by primary owner
const byOwner = {};
for (const c of companies) {
  const owner = (c.whoOwns || 'Unknown').split(',')[0].trim();
  if (!byOwner[owner]) byOwner[owner] = [];
  byOwner[owner].push(c);
}

const SYSTEM = `You write short, personal follow-up emails for Innovius Capital investors.
Innovius is a concentrated, operator-led VC fund in SF and NYC, Series A-B focus.

Voice rules:
- Short. Under 80 words per email.
- Direct and human. Not salesy.
- Each email must have a DIFFERENT angle from a generic intro — reference something specific about the company.
- Never use: "circling back", "touching base", "hope this finds you well", "following up", "just wanted to", "reach out", "synergy", "innovative", "game-changing"
- Subject line: 3-5 words, no punctuation

Return ONLY valid JSON. No markdown. No explanation.`;

async function generateForOwner(owner, ownerCompanies) {
  const companiesList = ownerCompanies.map((c, i) =>
    `${i + 1}. Company: ${c.companyName}
   Website: ${c.website || 'unknown'}
   Description: ${c.description || 'AI company'}
   City: ${c.cityState || 'unknown'}
   Last emailed: ${c.lastEmail || 'recently'}
   Previous email note: ${c.emailed || 'initial outreach via Apollo sequence'}`
  ).join('\n\n');

  const prompt = `${SYSTEM}

${owner} at Innovius Capital needs short personal follow-up emails for these companies.
Justin already sent an initial Apollo email. Now ${owner} wants to send a brief PERSONAL note
that feels different — not another template. Each should feel like it came directly from ${owner}.
${owner === 'Marci' ? 'Marci leads the NYC office, focuses on healthcare tech and vertical SaaS.' : ''}
${owner === 'Ethan' ? 'Ethan focuses on industrial tech, robotics, and hard tech companies.' : ''}
${owner === 'Koby' ? 'Koby focuses on construction tech, fintech, and vertical SaaS.' : ''}
${owner === 'Stu' ? 'Stu focuses on logistics, supply chain, and B2B SaaS.' : ''}
${owner === 'Xiaolei' ? 'Xiaolei focuses on AI infrastructure, data tools, and enterprise SaaS.' : ''}

Companies:
${companiesList}

Return JSON in this exact format:
{
  "followups": [
    {
      "company": "Company Name",
      "to_name": "CEO/Founder (use 'Hi there' if unknown)",
      "subject": "short subject",
      "body": "email body"
    }
  ]
}`;

  const { stdout } = await execFileAsync('claude', ['-p', prompt], {
    maxBuffer: 1024 * 1024 * 10,
    timeout: 120_000,
  });

  const content = stdout.trim();
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Parse error for ${owner}: ${content.slice(0, 200)}`);
  }
}

async function main() {
  const allFollowups = {};

  for (const [owner, ownerCompanies] of Object.entries(byOwner)) {
    console.log(`\nGenerating ${ownerCompanies.length} follow-ups for ${owner}...`);
    try {
      const result = await generateForOwner(owner, ownerCompanies);
      allFollowups[owner] = result.followups || [];
      console.log(`  ✓ ${allFollowups[owner].length} emails generated`);
    } catch (err) {
      console.error(`  ✗ Failed for ${owner}: ${err.message}`);
      allFollowups[owner] = [];
    }
  }

  // Save full results
  writeFileSync('./followup-drafts.json', JSON.stringify(allFollowups, null, 2));

  // Print all drafts
  console.log('\n' + '═'.repeat(70));
  console.log('FOLLOW-UP DRAFTS');
  console.log('═'.repeat(70));

  for (const [owner, followups] of Object.entries(allFollowups)) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📧 ${owner.toUpperCase()} (${followups.length} emails)`);
    console.log('─'.repeat(70));
    for (const f of followups) {
      console.log(`\n  Company: ${f.company}`);
      console.log(`  Subject: ${f.subject}`);
      console.log(`  Body:\n${f.body.split('\n').map(l => '    ' + l).join('\n')}`);
    }
  }

  console.log('\n\n✓ All drafts saved to followup-drafts.json');
}

main().catch(console.error);
