/**
 * create-followup-drafts.js
 *
 * Creates Gmail reply DRAFTS (does not send) for 31 companies on Justin's list
 * that haven't responded to the SF dinner invite.
 *
 * Threading approach: for each company, we know the exact Gmail message ID of
 * the most recent outbound email Justin/Marci sent them. We fetch that message's
 * RFC Message-ID header and use it for In-Reply-To, so the reply lands correctly
 * in each founder's inbox — even though Gmail groups all these sends into one
 * big batch thread on our end.
 */

import 'dotenv/config';
import { google } from 'googleapis';

const LUMA = 'https://lu.ma/innovius-carta-beyondthechasm-sf';
const BATCH_THREAD = '19d4c404e22d36ca'; // Justin's batch invite thread

function getAuth() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2;
}

// ─── Company list ──────────────────────────────────────────────────────────────
// lastOutboundGmailId: the Gmail message ID of the most recent outbound email
//   to this person — used to fetch the RFC Message-ID for In-Reply-To threading.
// threadId: the Gmail thread to attach the draft to (batch thread for most;
//   separate threads for AI Clearing and Topkey).

const COMPANIES = [
  {
    company: 'Aurelian',
    firstName: 'Max',
    replyToEmail: 'max@aurelian.com',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d999caed7a63b9',
    body: `Max - wanted to follow up here as well!

Aurelian is automating 911 call centers with AI — handling non-emergency calls so dispatchers can focus on real emergencies — but getting government agencies to adopt new technology means navigating procurement committees, union considerations, and risk-averse operations leaders who've run dispatch the same way for decades. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Polimorphic',
    firstName: 'Parth',
    replyToEmail: 'parth@polimorphic.com',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d942ab5f56fad9',
    body: `Parth - wanted to follow up here as well!

Polimorphic is bringing AI to local governments — chatbots, voice agents, and AI front desks that cut constituent services workload — but selling into cities and counties means navigating annual budget cycles, vendor prequalification, and elected officials who need to sign off on anything new. It's one of the slowest enterprise buying processes out there. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Joist',
    firstName: 'Rohan',
    replyToEmail: 'rohan@joist.ai',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d9411f50d62567',
    body: `Rohan - wanted to follow up here as well!

Joist is modernizing how contractors run their businesses — estimates, invoices, payments — but converting independent contractors who've run their business off the back of an envelope for 20 years is one of the harder behavior-change sells out there. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Bops',
    firstName: 'Jorge',
    replyToEmail: 'jrisquez@bops.ai',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d8f4aab5786bd6',
    body: `Jorge - wanted to follow up here as well!

Bops is solving on-shelf availability for consumer brands — using AI to pinpoint out-of-stocks and automate the fix across the supply chain — but getting large CPG companies to change how they manage inventory at the retailer level means aligning supply chain, category, and retail execution teams who are each moving at their own pace. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buying committee is slow-moving and fragmented. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'AI Clearing',
    firstName: 'Michael',
    replyToEmail: 'm@aiclearing.com',
    threadId: '19d4c2c7b814fdf8',
    lastOutboundGmailId: '19da8f0157641af3',
    body: `Michael - wanted to follow up here as well!

AI Clearing is bringing AI-powered progress monitoring to infrastructure construction — automating site tracking so owners and GCs always know exactly where a project stands — but getting large infrastructure owners and engineering firms to change how they manage project oversight is a deeply risk-averse sell in one of the most conservative industries. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Boon',
    firstName: 'Deepti',
    replyToEmail: 'deepti@getboon.ai',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19da8bbba21ec3a4',
    body: `Deepti - wanted to follow up here as well!

Boon is building the AI operating layer for commercial fleets — automating workflows across telematics, TMS, and dispatch — but getting fleet operators and logistics companies to trust AI with their core operations is a genuinely hard behavior change when those operators have run their business the same way for years. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Applause',
    firstName: 'Taylor',
    replyToEmail: 'taylor@applausehq.com',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d9e8c4fc511e56',
    body: `Taylor - wanted to follow up here as well!

Applause is helping home services companies — HVAC, pest control, lawn care — turn every field technician into a top performer through real-time recognition and incentives, but selling into a fragmented market of owner-operated businesses means navigating owners who are time-strapped, skeptical of software spend, and juggling a dozen other fires at once. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Seafair',
    firstName: 'Agapitos',
    replyToEmail: 'agapitos@seafair.io',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d9471d9af21d98',
    body: `Agapitos - wanted to follow up here as well!

Seafair is modernizing maritime crew management — digitizing one of the most complex, high-stakes HR workflows in any industry — but shipping companies are famously conservative operators running on legacy systems and long-standing relationships, making it a deeply trust-intensive sell to change how they manage crew. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Topkey',
    firstName: 'Jon',
    replyToEmail: 'jon@topkey.io',
    threadId: '19d4c3bb9b27204d',
    lastOutboundGmailId: '19da8c868d26b52b',
    body: `Jon - wanted to follow up here as well!

Topkey is building the financial operating system for vacation rental property managers — automating expenses, bill pay, and owner payouts — but getting property managers to hand over their financial workflows to a new platform is a high-trust, high-friction sell when those managers are already stretched thin across hundreds of properties. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Nectar',
    firstName: 'Joanna',
    replyToEmail: 'joanna.chung@nectarvet.com',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d4c4989b91fc4b',
    body: `Joanna - wanted to follow up here as well!

NectarVet is replacing legacy practice management systems in vet clinics with an AI-native platform that cuts admin time and brings joy back to clinic life — but displacing the existing PIMS is one of the stickiest enterprise replacements out there, requiring buy-in from the practice owner, head vet, and front desk in a world where downtime is simply not an option. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Aiprise',
    firstName: 'Chaitanya',
    replyToEmail: 'csarda@aiprise.com',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d9ce29792e830a',
    body: `Chaitanya - wanted to follow up here as well!

Aiprise is automating KYC and identity verification workflows with AI — dramatically cutting the time it takes to onboard customers in regulated industries — but selling into compliance and operations teams at fintechs and banks means navigating compliance officers, IT security, and legal, each with their own veto power and their own timeline. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buying committee is slow-moving and fragmented. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Fieldmaterials',
    firstName: 'Eldar',
    replyToEmail: 'eldar@fieldmaterials.com',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d9978047343104',
    body: `Eldar - wanted to follow up here as well!

Fieldmaterials is modernizing construction materials procurement — digitizing the sourcing, quoting, and ordering workflows that still run on phone calls and spreadsheets — but getting GCs and subcontractors to change how they buy materials means displacing habits and supplier relationships that have been in place for decades. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Beam Finance',
    firstName: 'Adam',
    replyToEmail: 'aeagle@usebeam.co',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d4c5fd418ec26a',
    body: `Adam - wanted to follow up here as well!

Beam is building financial and project management tools for contractors — automating estimates, invoicing, and expenses — but getting contractors to change how they run their back office means displacing spreadsheets and manual processes that have worked for them (well enough) for years. We have a portco, SewerAI, in a similar world — selling AI into infrastructure operators who are skeptical of changing core workflows. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Nuclearn',
    firstName: 'Brad',
    replyToEmail: 'brad@nuclearn.ai',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d8f2a83779fce7',
    body: `Brad - wanted to follow up here as well!

Nuclearn is bringing AI to nuclear power plant operations — modernizing training, compliance, and operational knowledge management in one of the most tightly regulated industries on earth — which means every sale involves plant operators, safety officers, regulatory bodies, and utility executives who each need to sign off before anything touches plant process. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Continuum Technologies',
    firstName: 'Alex',
    replyToEmail: 'alex@gocontinuum.ai',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d998ad18926990',
    body: `Alex - wanted to follow up here as well!

Continuum is automating B2B returns for wholesale and distribution companies — replacing the manual, error-prone process of handling warranties, repairs, and returns — but getting distributors and manufacturers to change how they handle post-sale workflows means selling into ops and IT teams that are risk-averse about touching anything customer-facing. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Purchaser',
    firstName: 'Drura',
    replyToEmail: 'drura@purchaser.ai',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d995b41c56a22b',
    body: `Drura - wanted to follow up here as well!

Purchaser is automating RFQ and procurement intelligence for industries where vendor quotes are unstructured and comparisons are manual — turning hours of spreadsheet work into instant, defensible sourcing data — but selling into procurement teams means navigating buyers who are deeply attached to how they've always managed vendor relationships and skeptical of anything that disrupts it. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Compyl',
    firstName: 'Stas',
    replyToEmail: 'stas@compyl.com',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d9d04edd2a81f8',
    body: `Stas - wanted to follow up here as well!

Compyl is automating GRC and compliance workflows — making it faster and less painful for companies to manage risk, audits, and regulatory requirements — but selling into security and compliance teams means navigating CISOs who are already drowning in tools and deeply skeptical of anything that adds complexity to an already crowded stack. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'OutMarket',
    firstName: 'Vishal',
    replyToEmail: 'vishal@outmarket.ai',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d8f214cd1ae94d',
    body: `Vishal - wanted to follow up here as well!

OutMarket is helping revenue and ops teams get smarter about their market, but getting enterprise buyers to shift how they think about and act on market intelligence — especially when they're already committed to existing workflows — takes a very deliberate GTM motion. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Cambio',
    firstName: 'Stephanie',
    replyToEmail: 'stephanie@cambio.ai',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d943ddae470eb3',
    body: `Stephanie - wanted to follow up here as well!

Cambio is helping commercial real estate funds decarbonize their portfolios — using AI to identify high-impact retrofits and build the investment case — but selling into large institutional real estate owners means aligning asset management, investment, and sustainability teams who are each moving to their own rhythm and often skeptical of new data telling them what to do with their buildings. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buying committee is fragmented. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'UptimeAI',
    firstName: 'Jag',
    replyToEmail: 'jag.gattu@uptimeai.com',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d4c59e0816725b',
    body: `Jag - wanted to follow up here as well!

UptimeAI is bringing predictive maintenance AI to industrial equipment operators — catching failures before they happen — but getting plant maintenance teams and ops leaders to trust AI with critical equipment decisions is a deeply conservative sell in an industry where unplanned downtime is measured in millions. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Medeloop',
    firstName: 'Rene',
    replyToEmail: 'rcaissie@medeloop.ai',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d8ef97866802a3',
    body: `Rene - wanted to follow up here as well!

Medeloop is making clinical data more actionable for health systems, but getting hospitals to adopt new data infrastructure means aligning clinical, IT, and compliance stakeholders who rarely move at the same speed. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buying process is slow and fragmented. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Quilr',
    firstName: 'Vidit',
    replyToEmail: 'va@quilr.ai',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d4c5fe030883bd',
    body: `Vidit - wanted to follow up here as well!

Quilr is preventing human-related security breaches with AI — embedding directly into employee workflows to stop risky behavior before it escalates — but selling into CISOs means fighting for attention in one of the noisiest enterprise markets, where buyers are drowning in vendor claims and deeply skeptical of yet another tool that promises to fix the human problem. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Maximor',
    firstName: 'Ram',
    replyToEmail: 'ram@maximor.ai',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19da8a810f8a5334',
    body: `Ram - wanted to follow up here as well!

Maximor is automating the most painful parts of accounting and finance ops — reconciliations, close, revenue recognition, reporting — replacing the Excel-heavy workflows that bury finance teams every month-end, but getting CFOs and controllers to trust AI agents with their close process is a high-stakes sell when audit accuracy and compliance are non-negotiable. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Mpathic',
    firstName: 'Grin',
    replyToEmail: 'grin@mpathic.ai',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d8f3ce562eeb32',
    body: `Grin - wanted to follow up here as well!

Mpathic is using AI to improve communication quality in clinical trials and high-stakes healthcare settings — analyzing conversations, detecting risk, and coaching teams — but selling into pharma companies and health systems means navigating clinical, regulatory, legal, and IT stakeholders who are all deeply cautious about AI anywhere near patient-adjacent contexts. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buying process is slow and fragmented. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Spur',
    firstName: 'Sneha',
    replyToEmail: 'sneha@tryspur.dev',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19da8b289b7733b5',
    body: `Sneha - wanted to follow up here as well!

Spur is an AI QA engineer for e-commerce and web — letting teams write tests in plain language instead of brittle code — but getting engineering and QA teams to trust AI for testing mission-critical user flows like checkout and onboarding is a genuinely high-stakes behavioral shift when those teams have been burned by flaky test suites before. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'AI Driller',
    firstName: 'Marat',
    replyToEmail: 'marat@aidriller.com',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d8f03a5fcdb471',
    body: `Marat - wanted to follow up here as well!

AI Driller is applying AI to drilling operations in oil and gas — optimizing decisions that have historically required experienced engineers and a lot of intuition — but getting drillers and operators to trust AI on their wellsite is one of the most conservative enterprise sells out there, in an industry where a bad call costs millions. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Arrow',
    firstName: 'Charles',
    replyToEmail: 'charles@heyarrow.com',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d996dd9c7980e6',
    body: `Charles - wanted to follow up here as well!

Arrow is modernizing how heavy equipment dealers sell — CRM, inventory, marketing automation, and payments all in one platform — but getting dealers who have run their business the same way for decades to adopt new sales technology is a long conversion cycle when the dealer-to-buyer relationship has historically been built on phone calls and personal trust. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Vooma',
    firstName: 'Mike',
    replyToEmail: 'mike@vooma.ai',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d4c489374ed6f3',
    body: `Mike - wanted to follow up here as well!

Vooma is automating the back office for freight brokers and carriers — quoting, load building, check calls — with AI agents that work across email, text, and voice, but getting brokers and carriers who've run ops on manual hustle and legacy TMS software for years to trust AI with their core workflows is a meaningful behavior change. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Drawer AI',
    firstName: 'Den',
    replyToEmail: 'den@drawer.ai',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d946876393880c',
    body: `Den - wanted to follow up here as well!

Drawer is modernizing electrical estimating for contractors with AI, but getting estimators who've worked the same way for 20+ years to trust a new tool is a genuinely behavioral sell. We have a portco, SewerAI, in a similar world — selling AI into infrastructure operators who are skeptical of handing core workflows to software. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Basetwo AI',
    firstName: 'Thouheed',
    replyToEmail: 'thouheed@basetwo.ai',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d8f0cd93fca210',
    body: `Thouheed - wanted to follow up here as well!

Basetwo is bringing AI copilots to manufacturing and chemical process engineers — combining physics AI with ML to optimize production yield and cycle times — but getting Fortune 500 plant engineers to trust AI recommendations on their production floor means an extensive validation cycle with quality, safety, and operations all needing to sign off first. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
  {
    company: 'Lupa',
    firstName: 'Nicolo',
    replyToEmail: 'nicolo@lupapets.com',
    threadId: BATCH_THREAD,
    lastOutboundGmailId: '19d4c59d4fd816c0',
    body: `Nicolo - wanted to follow up here as well!

Lupa is building the AI-native veterinary practice management platform — replacing the fragmented stack of PIMS, communication tools, and payments in one place — but displacing legacy software in a vet practice is notoriously sticky: the practice owner, head vet, and front desk all have to agree, and downtime during the switch is simply not an option when patients are waiting. Nicole Baer, CMO at Carta, is going to be talking about what's actually working in enterprise demand gen when the buyer is slow-moving. I think you'd find it useful!

Hope to see you there!

${LUMA}`,
  },
];

// ─── Gmail helpers ─────────────────────────────────────────────────────────────

function encodeBase64Url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getHeader(message, name) {
  const headers = message.payload?.headers || [];
  const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

/**
 * Fetch the RFC 2822 Message-ID of a specific Gmail message.
 */
async function fetchMessageId(gmail, gmailMsgId) {
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: gmailMsgId,
    format: 'metadata',
    metadataHeaders: ['Message-ID', 'References', 'Subject'],
  });
  return {
    messageId: getHeader(res.data, 'Message-ID'),
    references: getHeader(res.data, 'References'),
    subject: getHeader(res.data, 'Subject'),
  };
}

async function createReplyDraft(gmail, co, inReplyToMessageId, references, subject) {
  const refsString = references
    ? `${references} ${inReplyToMessageId}`
    : inReplyToMessageId;

  const reSubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

  const rawEmail = [
    `From: marci@innoviuscapital.com`,
    `To: ${co.replyToEmail}`,
    `Subject: ${reSubject}`,
    `In-Reply-To: ${inReplyToMessageId}`,
    `References: ${refsString}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
    ``,
    co.body,
  ].join('\r\n');

  const encoded = encodeBase64Url(rawEmail);

  const draft = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        threadId: co.threadId,
        raw: encoded,
      },
    },
  });

  return draft.data.id;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const auth = getAuth();
  const gmail = google.gmail({ version: 'v1', auth });

  console.log(`Creating ${COMPANIES.length} follow-up draft replies...\n`);

  const results = { created: [], failed: [] };

  for (const co of COMPANIES) {
    process.stdout.write(`  ${co.company} (${co.firstName})... `);

    try {
      // Fetch the Message-ID of the last outbound email to this person
      const { messageId, references, subject } = await fetchMessageId(gmail, co.lastOutboundGmailId);

      if (!messageId) {
        process.stdout.write(`⚠ could not find Message-ID for Gmail msg ${co.lastOutboundGmailId}\n`);
        results.failed.push(co.company);
        continue;
      }

      const draftId = await createReplyDraft(gmail, co, messageId, references, subject);

      process.stdout.write(`✓ draft → ${co.replyToEmail}\n`);
      results.created.push({ company: co.company, replyTo: co.replyToEmail, draftId });

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 350));

    } catch (e) {
      process.stdout.write(`✗ error: ${e.message}\n`);
      results.failed.push(co.company);
    }
  }

  console.log(`\n✓ Done!`);
  console.log(`  ${results.created.length} drafts created in Gmail`);
  if (results.failed.length) {
    console.log(`  ${results.failed.length} failed: ${results.failed.join(', ')}`);
  }

  console.log(`\nDrafts created:`);
  for (const r of results.created) {
    console.log(`  ${r.company} → ${r.replyTo}`);
  }
}

main().catch(console.error);
