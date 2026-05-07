/**
 * generate.js — Email campaign generation via Claude Code CLI
 * Uses `claude -p` (non-interactive print mode) so no API key is needed —
 * just your existing Claude Code subscription.
 */

import 'dotenv/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { CAMPAIGN_EMAIL_COUNTS, getDinnerInvite } from './classify.js';

const execFileAsync = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));

const SYSTEM_PROMPT = `You are writing outreach emails for Marci Medford, investor at Innovius Capital.

Voice: short, direct, conversational, no jargon, no AI-sounding phrases.
Tone: confident but not pushy. Like a smart friend who happens to know the space.

NEVER use these phrases (they sound robotic):
- "tells me you've solved"
- "genuinely hard to displace"
- "defensible moat"
- "underwriting"
- "at the end of the day"
- "it's clear that"
- "I was impressed by"
- "I'd love to connect"
- "hope this finds you well"
- "touching base"
- "circling back"
- "per my last email"
- "synergy"
- "ecosystem"
- "leverage" (as a verb)
- "game-changing"
- "innovative"
- "cutting-edge"
- "disruptive"
- "value-add"
- "reach out"

ALWAYS include:
- A specific, non-obvious observation about their market or what they're building
- A clear reason why Marci is reaching out to THIS company specifically
- A direct, single ask (usually: 15-20 min call, or dinner invite if city matches)

Keep emails SHORT. First email under 100 words. Follow-ups under 80 words.
Subject lines: 3-6 words, no punctuation, no clickbait.

Return ONLY valid JSON — no markdown, no explanation, no code fences.`;

/**
 * Load a prompt template file.
 */
async function loadPromptTemplate(campaignType) {
  const fileMap = {
    NET_NEW: 'net_new.txt',
    WARM: 'warm.txt',
    CANNOT_BREAK_IN: 'cannot_break_in.txt',
    RE_ENGAGE: 're_engage.txt',
  };
  const file = join(__dir, 'prompts', fileMap[campaignType] || 'net_new.txt');
  try {
    return await readFile(file, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Build the user prompt for email generation.
 */
async function buildUserPrompt(company, campaignType, emailHistory) {
  const template = await loadPromptTemplate(campaignType);
  const dinnerInvite = getDinnerInvite(company.cityState);
  const emailCount = CAMPAIGN_EMAIL_COUNTS[campaignType];

  return `${template}

---
COMPANY DETAILS:
Company: ${company.companyName}
Website: ${company.website || 'unknown'}
Description: ${company.description || 'unknown'}
City/State: ${company.cityState || 'unknown'}
Founder Name: ${company.founderName || 'unknown (use "Hi there" or generic opener)'}

CAMPAIGN CONTEXT:
Campaign type: ${campaignType}
Emails to write: ${emailCount}
Emails previously sent: ${company.emailCount || 0}
Last contact: ${company.lastEmailed || 'none'}
Dinner invite: ${dinnerInvite}
${emailHistory?.notes?.length ? `\nAffinity notes:\n${emailHistory.notes.join('\n')}` : ''}

INSTRUCTIONS:
Write a ${campaignType} email campaign of ${emailCount} emails. Each email should be sent roughly 5-7 days apart.
${dinnerInvite !== 'NONE' ? `Email 3 or 4 should mention the dinner event (${dinnerInvite}) as a softer ask.` : ''}

Return a JSON object ONLY — no markdown, no preamble:
{
  "email_1": {"subject": "...", "body": "..."},
  "email_2": {"subject": "...", "body": "..."},
  ${Array.from({ length: emailCount - 2 }, (_, i) => `"email_${i + 3}": {"subject": "...", "body": "..."}`).join(',\n  ')}
}`;
}

/**
 * Generate a full email campaign for one company.
 * Uses `claude -p` (Claude Code CLI print mode) — no API key needed.
 * Returns { email_1, email_2, ... } object.
 */
export async function generateCampaign(company, campaignType, affinityData = null) {
  const userPrompt = await buildUserPrompt(company, campaignType, affinityData);
  const fullPrompt = `${SYSTEM_PROMPT}\n\n${userPrompt}`;

  // claude -p runs a single non-interactive prompt and exits
  const { stdout } = await execFileAsync('claude', ['-p', fullPrompt], {
    maxBuffer: 1024 * 1024 * 10, // 10MB
    timeout: 120_000,            // 2 min timeout per company
  });

  const content = stdout.trim();

  try {
    return JSON.parse(content);
  } catch {
    // Try to extract JSON if there's surrounding text
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Failed to parse JSON from Claude response:\n${content.slice(0, 500)}`);
  }
}
