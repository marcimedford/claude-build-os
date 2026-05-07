/**
 * write-linkedin-outreach.js
 * Writes pre-enriched CEO LinkedIn data to the "LinkedIn Outreach" tab.
 * CEO data was collected via Apollo MCP tool across multiple sessions.
 */

import 'dotenv/config';
import { google } from 'googleapis';
import { readCompanies } from './sheets.js';

const SPREADSHEET_ID = process.env.SHEETS_SPREADSHEET_ID;

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
  "can't come", "can't make it", 'attending', 'meeting booked'
];

// All enrichment data collected via Apollo MCP
// Key: lowercase company name (used for matching)
const ENRICHMENT = {
  // Batch 1-3 (prior sessions)
  'applause':           { name: 'Taylor Olson',            title: 'CEO',                  linkedin: 'https://www.linkedin.com/in/jtaylorolson',                location: 'Salt Lake City, UT' },
  'telegraph':          { name: 'Harris Ligon',             title: 'CEO',                  linkedin: 'https://www.linkedin.com/in/ligon',                       location: 'Chicago, IL' },
  'epsilon3':           { name: 'Laura Crabtree',           title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/lauracrabtree',               location: 'Redondo Beach, CA' },
  'track3d':            { name: 'Chaitanya K',              title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/chaitanyanaredla',            location: 'Milpitas, CA' },
  'ai clearing':        { name: 'Michael Mazur',            title: 'CEO',                  linkedin: 'https://www.linkedin.com/in/mimazur',                     location: 'Austin, TX' },
  'aiprise':            { name: 'Chaitanya Sarda',          title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/chaitanyasarda',              location: 'San Francisco, CA' },
  'field materials':    { name: 'Eldar Sadikov',            title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/eldarsadikov',                location: 'Charlotte, NC' },
  'm7health':           { name: 'Ilana Borkenstein',        title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/ilanaspringer',               location: 'New York, NY' },
  'polimorphic':        { name: 'Parth Shah',               title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/parthhemalshah',              location: 'New York, NY' },
  'toma':               { name: 'Monik Pamecha',            title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/monikp',                      location: 'San Francisco, CA' },
  'continuum':          { name: 'Alex Witcpalek',           title: 'CEO',                  linkedin: 'https://www.linkedin.com/in/alex-witcpalek-419b052b',     location: 'Chicago, IL' },
  'maximor':            { name: 'Ramnandan Krishnamurthy',  title: 'CEO',                  linkedin: 'https://www.linkedin.com/in/ramnandan-krishnamurthy-989a7564', location: 'New York, NY' },
  'allspice':           { name: 'Valentina Ratner',         title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/valentinaratner',             location: 'San Francisco, CA' },
  'spur':               { name: 'Sneha Sivakumar',          title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/sivakumarsneha',              location: 'New York, NY' },
  'joist':              { name: 'Rohan Jawali',             title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/rohan-jawali-7388875',        location: 'San Diego, CA' },
  'ai driller':         { name: 'Marat Zaripov',            title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/mzaripov',                    location: 'Houston, TX' },
  'uptimeai':           { name: 'Jagadish Gattu',           title: 'CEO',                  linkedin: 'https://www.linkedin.com/in/jagadish-gattu-a1822b4',      location: 'San Ramon, CA' },
  'outmarket':          { name: 'Vishal Sankhla',           title: 'CEO',                  linkedin: 'https://www.linkedin.com/in/vishalsankhla',               location: '' },
  'mpathic':            { name: 'Grin Lord',                title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/grinlord',                    location: 'Seattle, WA' },
  'medeloop':           { name: 'Rene Caissie',             title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/renecaissie',                 location: 'Stanford, CA' },
  'quilr':              { name: 'Vidit Arora',              title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/viditarora',                  location: 'Austin, TX' },
  'aurelian':           { name: 'Adam Harrison',            title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/adam-harrison-aurelian',      location: 'London, UK' },
  'reach security':     { name: 'Garrett Hamilton',         title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/garrettdh',                   location: 'San Francisco, CA' },
  'bops':               { name: 'Jorge Risquez',            title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/jorge-risquez-3b355146',      location: 'New York, NY' },
  'compyl':             { name: 'Stas Bojoukha',            title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/stas-bojoukha',               location: 'New York, NY' },
  'boon':               { name: 'Deepti Yenireddy',         title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/deepti-yenireddy',            location: 'San Francisco, CA' },
  'avo':                { name: 'Stefania Olafsdottir',     title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/stefaniabjarneyolafsdottir',  location: 'Iceland' },
  'purchaser':          { name: 'Drura Parrish',            title: 'CEO',                  linkedin: 'https://www.linkedin.com/in/drura-parrish-b7b5bb52',      location: 'Lexington, KY' },
  'nuclearn':           { name: 'Bradley Fox',              title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/bradley-fox-b1402315',        location: 'Phoenix, AZ' },
  'cambio':             { name: 'Leia Guzman',              title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/leia-de-guzman',              location: 'San Francisco, CA' },
  'rebar':              { name: 'Evan Brown',               title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/evan-brown-521965139',        location: 'New York, NY' },
  'iris finance':       { name: 'Drew Fallon',              title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/drew-f-74947b117',            location: 'Chicago, IL' },
  'maneva':             { name: 'Rae Jeong',                title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/rae-jeong-35291592',          location: 'Toronto, Canada' },
  // Batch 4
  'honey health':       { name: 'Matt Faustman',            title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/matthewfaustman',             location: 'Menlo Park, CA' },
  'lupa':               { name: 'Joseph Burns',             title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/josephrobertburns',           location: '' },
  'scotch':             { name: 'Jake Bolling',             title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/jakebolling',                 location: 'Denver, CO' },
  'yunu':               { name: 'Jeffrey Sorenson',         title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/jeffrey-sorenson-273415',     location: 'North Carolina' },
  'drawer':             { name: 'Den Lavrik',               title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/denlavrik',                   location: 'Austin, TX' },
  'clearstep':          { name: 'Adeel Malik',              title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/adeel-malik-3ba345ba',        location: 'New York, NY' },
  'olli health':        { name: 'Eric Steege',              title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/ericsteege',                  location: 'Madison, WI' },
  'synthio':            { name: 'Supreet Deshpande',        title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/supreetdeshpande',            location: 'San Francisco, CA' },
  'canid':              { name: 'Pedro Lozada',             title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/psanchezdl',                  location: 'New York, NY' },
  'healia':             { name: 'Priyang Shah',             title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/priyangshah',                 location: 'Columbus, OH' },
  // Batch 5
  'titan intake':       { name: 'Patrick Bruce',            title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/patrickthebruce',             location: 'Tulsa, OK' },
  'barti':              { name: 'Colton Calandrella',       title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/coltoncalandrella',           location: 'San Francisco, CA' },
  'passage health':     { name: 'Bill White',               title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/bill-white-6aa2a520',         location: 'New York, NY' },
  'shiftup':            { name: 'Nick Valla',               title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/nick-valla-72592828',         location: 'Scottsdale, AZ' },
  'integrate':          { name: 'John Conafay',             title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/john-conafay-6734354a',       location: 'Seattle, WA' },
  'bonsai health':      { name: 'Luke Kervin',              title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/lukekervin',                  location: 'Los Angeles, CA' },
  'myzorro':            { name: 'Guy Ezekiel',              title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/guy-ezekiel',                 location: 'New York, NY' },
  'risa':               { name: 'Kshitij Jaggi',            title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/kshitijjaggi',                location: 'Palo Alto, CA' },
  'alden':              { name: 'Rose Huang',               title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/rose-huang',                  location: '' },
  'kouper':             { name: 'Ablimit Keskin',           title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/ablimit',                     location: 'San Francisco, CA' },
  // Batch 6
  'assured':            { name: 'Rahul Shivkumar',          title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/rahul-shivkumar-04138252',    location: 'New York, NY' },
  'sunbound':           { name: 'Manny Cominsky',           title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/mcominsky',                   location: '' },
  'basetwo':            { name: 'Thouheed Gaffoor',         title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/thouheed',                    location: 'Toronto, Canada' },
  'elligint':           { name: 'Christopher Caramanico',   title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/chriscaramanico',             location: 'North Carolina' },
  'harmonic security':  { name: 'Alastair Paterson',        title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/alastair-paterson-2586445',   location: 'San Francisco, CA' },
  'greenboard':         { name: 'Dave Feldman',             title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/david-feldman',               location: 'New York, NY' },
  'tidalwave':          { name: 'Diane Yu',                 title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/dianeyu',                     location: 'New York, NY' },
  'pax':                { name: 'Penny Chen',               title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/penny-chen-8b47b271',         location: '' },
  'potato':             { name: 'Nick Edwards',             title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/nick-edwards-phd',            location: 'San Diego, CA' },
  'asha health':        { name: 'Akkshay Khoslaa',          title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/akkshay',                     location: 'New York, NY' },
  // Batch 7
  'fintary':            { name: 'Qiyun Cai',                title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/qiyuncai',                    location: 'San Francisco, CA' },
  'confido':            { name: 'Shreyas Lad',              title: 'CEO, Co-Founder',      linkedin: 'https://www.linkedin.com/in/shreyaslad',                  location: 'New York, NY' },
  'glimpse':            { name: 'Eric Moch',                title: 'Cofounder and CEO',    linkedin: 'https://www.linkedin.com/in/ericmoch',                    location: 'Somerville, MA' },
  'flovision':          { name: 'Rian Donnell',             title: 'Founder and CEO',      linkedin: 'https://www.linkedin.com/in/rianmcdonnell',               location: 'Chicago, IL' },
  'first bite':         { name: 'Reed McCord',              title: 'Founder and CEO',      linkedin: 'https://www.linkedin.com/in/reed-mccord-b2543024',        location: 'Redwood City, CA' },
  'quandri':            { name: 'Jackson Fregeau',          title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/jackson-fregeau-073737158',   location: 'Vancouver, Canada' },
  'salespatriot':       { name: 'Nelson Ray',               title: 'CEO & Co-Founder',     linkedin: 'https://www.linkedin.com/in/nelson-ray',                  location: 'San Francisco, CA' },
  'buildcheck':         { name: 'Alexander Michalatos',     title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/amichalatos',                 location: 'Stanford, CA' },
  'bpr hub':            { name: 'Teja Edara',               title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/tejaedara',                   location: 'Toronto, Canada' },
  'dirac':              { name: 'Filip Aronshtein',         title: 'Founder & CEO',        linkedin: 'https://www.linkedin.com/in/fila',                        location: 'New York, NY' },
  // Batch 8
  'cloneops':           { name: 'David Bell',               title: 'Founder/CEO',          linkedin: 'https://www.linkedin.com/in/david-bell-034b7b35',         location: 'Fort Lauderdale, FL' },
  'oii':                { name: 'Uzair Bawany',             title: 'Chief Executive Officer', linkedin: 'https://www.linkedin.com/in/uzairbawany',              location: 'London, UK' },
  'xbuild':             { name: 'Jahan Khanna',             title: 'Chief Executive Officer', linkedin: 'https://www.linkedin.com/in/jahan-khanna-10392327',    location: 'San Francisco, CA' },
  'central':            { name: 'Josh Wymer',               title: 'Co-founder & CEO',     linkedin: 'https://www.linkedin.com/in/joshwymer',                   location: 'San Francisco, CA' },
  '1tcc':               { name: 'Sanjay Bonde',             title: 'Chairman and CEO',     linkedin: 'https://www.linkedin.com/in/sanjaybonde',                 location: 'Menlo Park, CA' },
  'tenor':              { name: 'James Cross',              title: 'Co-Founder',           linkedin: 'https://www.linkedin.com/in/jamesrcross',                 location: 'San Francisco, CA' },
  'carepilot':          { name: 'Joseph Tutera',            title: 'Founder',              linkedin: 'https://www.linkedin.com/in/josephtutera',                location: 'Kansas City, MO' },
  'cambium carbon':     { name: 'Theo Hooker',              title: 'Co-Founder',           linkedin: 'https://www.linkedin.com/in/theo-hooker',                 location: 'San Francisco, CA' },
  'stell':              { name: 'Anne Wen',                 title: 'Co-founder',           linkedin: 'https://www.linkedin.com/in/anneqwen',                    location: 'San Francisco, CA' },
  'blok':               { name: 'Olivia Higgs',             title: 'Co-Founder',           linkedin: 'https://www.linkedin.com/in/oliviahiggs',                 location: 'San Francisco, CA' },
  // Batch 9
  'glide':              { name: 'Vishnu Chakroborty',       title: 'Co-Founder',           linkedin: 'https://www.linkedin.com/in/vishnu-chakroborty',          location: 'New York, NY' },
  // From Harmonic/Affinity — previously no Apollo match
  'seafair':            { name: 'Agapitos Diakogiannis',    title: 'Co-founder & CEO',     linkedin: 'https://www.linkedin.com/in/adiakogiannis',               location: 'New York, NY' },
  'topkey':             { name: 'Jonathan Sukhia',          title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/jonathansukhia',              location: 'San Francisco, CA' },
  'beam finance':       { name: 'Adam Eagle',               title: 'Founder & CEO',        linkedin: 'https://www.linkedin.com/in/areagle',                     location: 'San Francisco, CA' },
  'vooma':              { name: 'Jesse Buckingham',         title: 'Founder & CEO',        linkedin: 'https://www.linkedin.com/in/jesse-buckingham-79649a26',   location: 'San Francisco, CA' },
  'singlefile':         { name: 'Aaron Finn',               title: 'CEO',                  linkedin: 'https://www.linkedin.com/in/aaronfinn',                   location: 'Seattle, WA' },
  'evidently':          { name: 'Elena Samuylova',          title: 'CEO & Co-founder',     linkedin: 'https://www.linkedin.com/in/elenasamuylova',              location: 'San Francisco, CA' },
  'firstwork':          { name: 'Vardhan Kapoor',           title: 'CEO & Co-Founder',     linkedin: 'https://www.linkedin.com/in/vardhan-kapoor',              location: 'New York, NY' },
  'gallatin ai':        { name: 'Woody Glier',              title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/woodyglier',                  location: 'El Segundo, CA' },
  'netai':              { name: 'Deepak Kakadia',           title: 'CEO & Founder',        linkedin: 'https://www.linkedin.com/in/deepakkakadia',               location: 'Palo Alto, CA' },
  // Key-mismatch aliases — sheet name differs from Apollo key
  'irisfinance.co':     { name: 'Drew Fallon',              title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/drew-f-74947b117',            location: 'Chicago, IL' },
  'olli':               { name: 'Eric Steege',              title: 'CEO & Co-founder',     linkedin: 'https://www.linkedin.com/in/ericsteege',                  location: 'Madison, WI' },
  'honeyhealth':        { name: 'Matt Faustman',            title: 'Co-Founder & CEO',     linkedin: 'https://www.linkedin.com/in/matthewfaustman',             location: 'Mountain View, CA' },
};

function findEnrichment(companyName) {
  const lower = companyName.toLowerCase().trim();

  // 1. Exact match
  if (ENRICHMENT[lower]) return ENRICHMENT[lower];

  // 2. Key-contains-company (company name is substring of key)
  for (const [key, val] of Object.entries(ENRICHMENT)) {
    if (key === lower) return val; // already checked above
    if (lower.startsWith(key) || lower.endsWith(key)) return val;
  }

  // 3. Company-contains-key (key is substring of company name)
  // Sort by key length descending to prefer longer (more specific) matches
  const sortedKeys = Object.keys(ENRICHMENT).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (key.length >= 4 && lower.includes(key)) return ENRICHMENT[key];
  }

  return null;
}

async function main() {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const TAB = 'LinkedIn Outreach';

  console.log('Reading companies from sheet...');
  const companies = await readCompanies();

  const targets = companies.filter(c => {
    const pri = (c.priority || '').toLowerCase();
    const camp = (c.campaignTypeOverride || '').toLowerCase();
    const status = (c.status || '').toLowerCase();
    return (pri === 'high' || pri === 'medium')
      && camp.includes('cold')
      && !RESPONDED.includes(status);
  });

  console.log(`Found ${targets.length} target companies\n`);

  const rows = [];
  let matched = 0;

  for (const c of targets) {
    const enriched = findEnrichment(c.companyName);
    const location = c.cityState || enriched?.location || '';
    const ceoName = enriched?.name || '';
    const ceoTitle = enriched?.title || '';
    const linkedinUrl = enriched?.linkedin || '';

    if (enriched) matched++;
    const status = enriched ? `${ceoName} — ${linkedinUrl}` : 'no match';
    console.log(`  ${c.companyName}: ${status}`);

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
  }

  console.log(`\nMatched ${matched}/${targets.length} companies with CEO data`);
  console.log('Writing to sheet...');

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
