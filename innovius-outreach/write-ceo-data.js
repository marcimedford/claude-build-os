/**
 * write-ceo-data.js
 * Writes enriched CEO data (from Harmonic) into the LinkedIn Outreach tab.
 */

import 'dotenv/config';
import { google } from 'googleapis';

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

// All enriched data from Harmonic lookups
const ENRICHED = {
  'metal.ai':            { name: 'Taylor Lowe',                       title: 'CEO',                                    linkedin: 'https://linkedin.com/in/taylorlowe11',              email: 'taylor@getmetal.io' },
  'wisor.ai':            { name: 'Orel Hershkovitch',                 title: 'Co-Founder',                             linkedin: 'https://linkedin.com/in/orelhershkovitch',          email: '' },
  'titanintake.com':     { name: 'Rachel Brown',                      title: '',                                       linkedin: 'https://linkedin.com/in/rachel-brown-6a340114a',    email: 'rachel@titanintake.com' },
  'maneva.ai':           { name: 'Rae Jeong',                         title: 'Co-Founder',                             linkedin: 'https://linkedin.com/in/rae-jeong-35291592',        email: 'rae@laplacerobotics.com' },
  'discern.com':         { name: 'Raj Patel',                         title: 'Co-Founder',                             linkedin: 'https://linkedin.com/in/raj-patel-a275b834',        email: 'raj@discern.com' },
  'glimp.se':            { name: 'Peter Attia',                       title: 'Cofounder and CTO',                      linkedin: 'https://linkedin.com/in/peter-m-attia',             email: '' },
  'mulberri.io':         { name: 'Vipin Vindal',                      title: 'Co-Founder',                             linkedin: 'https://linkedin.com/in/vipinvindal',               email: '' },
  'nectarvet.com':       { name: 'Joanna Chung',                      title: 'Co-Founder & CEO',                       linkedin: 'https://linkedin.com/in/joannachung',               email: 'joanna@nectarvet.com' },
  'heyarrow.com':        { name: 'Logan Murphy',                      title: '',                                       linkedin: 'https://linkedin.com/in/logan-murphy-a6835a51',     email: '' },
  'sage.care':           { name: 'Justin Ho',                         title: 'Co-Founder and CEO',                     linkedin: 'https://linkedin.com/in/justin-ho-0351783',         email: 'justin@sage.care' },
  'sawmills.ai':         { name: 'Ronit Belson',                      title: 'Chief Executive Officer',                linkedin: 'https://linkedin.com/in/ronit-belson-0a3a7b4',      email: 'ronit@sawmills.ai' },
  'dragonboat.io':       { name: 'Becky Flint',                       title: 'Founder and CEO',                        linkedin: 'https://linkedin.com/in/beckyflint',                email: 'becky@dragonboat.io' },
  'openlayer.com':       { name: 'Gabriel Bayomi Tinoco Kalejaiye',   title: 'Co-Founder & CEO',                       linkedin: 'https://linkedin.com/in/gbayomi',                   email: 'gabriel@openlayer.app' },
  'aerovect.com':        { name: 'Raymond Wang',                      title: 'Co-Founder',                             linkedin: 'https://linkedin.com/in/raymondrwang',              email: 'raymond.wang@aerovect.com' },
  'quindar.space':       { name: 'Nate Hamet',                        title: 'Chief Executive Officer',                linkedin: 'https://linkedin.com/in/nathanhamet',               email: 'nate.hamet@quindar.space' },
  'secro.io':            { name: 'Michele Sancricca',                 title: 'Co-founder and CEO',                     linkedin: 'https://linkedin.com/in/michelesancricca',          email: 'ms@secro.io' },
  'uplinq.com':          { name: 'Alex Glenn',                        title: 'Co-Founder & CEO',                       linkedin: 'https://linkedin.com/in/alexandercglenn',           email: 'alex@uplinq.com' },
  'concntric.com':       { name: "Steve Dell'Orto",                   title: 'Founder & CEO',                          linkedin: 'https://linkedin.com/in/stevedellorto',             email: 'steve@concntric.com' },
  'buildtrayd.com':      { name: 'Anna Berger',                       title: '',                                       linkedin: 'https://linkedin.com/in/annajberger',               email: 'anna@buildtrayd.com' },
  'auxili.us':           { name: 'Adam Weisman',                      title: 'Co-founder & CEO',                       linkedin: 'https://linkedin.com/in/weis',                      email: 'adam@auxili.us' },
  'krane.tech':          { name: 'Eshan Jayamanne',                   title: 'Founder and CEO',                        linkedin: 'https://linkedin.com/in/eshan-jayamanne-pe-95b85724', email: 'eshan@krane.tech' },
  'predictap.com':       { name: 'Russell Franks',                    title: 'President and Co-Founder',               linkedin: 'https://linkedin.com/in/russellfranks13',           email: 'rfranks@predictap.com' },
  'upwell.com':          { name: 'Charley Dehoney',                   title: 'CEO & Co-Founder',                       linkedin: 'https://linkedin.com/in/cdehoney',                  email: 'charley.dehoney@upwell.com' },
  'userevidence.com':    { name: 'Evan Huck',                         title: 'CEO & Co-Founder',                       linkedin: 'https://linkedin.com/in/evanhuck',                  email: 'evan@userevidence.com' },
  'withflex.com':        { name: 'Sam Okeefe',                        title: '',                                       linkedin: 'https://linkedin.com/in/samokeefe',                 email: 'sam.okeefe@withflex.com' },
  'virtueai.com':        { name: 'Bo Li',                             title: '',                                       linkedin: 'https://linkedin.com/in/lxbosky',                   email: 'boli@virtueai.com' },
  'remihq.com':          { name: 'Reno Mendenhall',                   title: '',                                       linkedin: 'https://linkedin.com/in/reno-mendenhall-16a934aa',  email: 'reno@remihq.com' },
  'spoileralert.com':    { name: 'Ricky Ashenfelter',                 title: '',                                       linkedin: 'https://linkedin.com/in/rashenfelter',              email: '' },
  'compt.io':            { name: 'Amy Spurling',                      title: 'Founder & CEO',                          linkedin: 'https://linkedin.com/in/amyspurling',               email: 'amy@compt.io' },
  'kalepa.com':          { name: 'Daniel Hillman',                    title: 'Co-Founder',                             linkedin: 'https://linkedin.com/in/dannyhillman',              email: 'daniel.hillman@kalepa.com' },
  'tryleverage.ai':      { name: 'Nadav Ullman',                      title: '',                                       linkedin: 'https://linkedin.com/in/nadavism',                  email: 'nadav@tryleverage.ai' },
  'infinant.com':        { name: 'Riaz Syed',                         title: 'Founder & CEO',                          linkedin: 'https://linkedin.com/in/riaz-syed-199b823',         email: 'riaz.syed@infinant.com' },
  'farmraise.com':       { name: 'Jayce Hafner',                      title: 'Chief Executive Officer',                linkedin: 'https://linkedin.com/in/jayce-hafner-88a85b2a3',    email: 'jayce@farmraise.us' },
  'podfoods.co':         { name: 'Larissa Russell',                   title: '',                                       linkedin: 'https://linkedin.com/in/rissyrussell',              email: 'larissa@podfoods.co' },
  'kanmon.com':          { name: 'Mengxi Lu',                         title: 'Co-Founder',                             linkedin: 'https://linkedin.com/in/mengxilu',                  email: 'mengxi@kanmon.com' },
  'willowservicing.com': { name: 'Laura Cain',                        title: '',                                       linkedin: 'https://linkedin.com/in/lauramcain',                email: 'laura@willowservicing.com' },
  'invertbio.com':       { name: 'Rob Lambert',                       title: '',                                       linkedin: 'https://linkedin.com/in/rob-lambert-00a9b01a',      email: '' },
  'keragon.com':         { name: 'Conno Christou',                    title: 'Co-Founder',                             linkedin: 'https://linkedin.com/in/connochristou',             email: 'conno.christou@keragon.com' },
  'highbyte.com':        { name: 'Tony Paine',                        title: 'Co-Founder & Chief Executive Officer',   linkedin: 'https://linkedin.com/in/tonypaine',                 email: 'tony.paine@highbyte.com' },
  'netrise.io':          { name: 'Michael Scott',                     title: 'Co-founder & CTO',                       linkedin: 'https://linkedin.com/in/michaelscottosce',          email: 'michael.scott@netrise.io' },
  'parkade.com':         { name: 'Ben Plowman',                       title: 'Co-Founder / CTO',                       linkedin: 'https://linkedin.com/in/plowman',                   email: 'ben@parkade.com' },
  'engageyourbiz.com':   { name: 'Josh Pro',                          title: '',                                       linkedin: 'https://linkedin.com/in/josh-pro-56875024a',        email: '' },
  'enertiv.com':         { name: 'Connell Mcgill',                    title: 'Co-Founder',                             linkedin: 'https://linkedin.com/in/connellmcgill',             email: 'connell@enertiv.com' },
  'signoz.io':           { name: 'Ankit Nayan',                       title: 'Co-founder and CTO',                     linkedin: 'https://linkedin.com/in/ankitnayan',                email: 'ankit@signoz.io' },
  'strongestlayer.com':  { name: 'Alan Lefort',                       title: 'CEO and Cofounder',                      linkedin: 'https://linkedin.com/in/alan-lefort73',             email: 'alan@strongestlayer.ai' },
  'trustlayer.io':       { name: 'John Fohr',                         title: 'Co-Founder',                             linkedin: 'https://linkedin.com/in/johnfohr',                  email: 'john@trustlayer.io' },
  'hemlane.com':         { name: 'Dana Dunford',                      title: 'CEO',                                    linkedin: 'https://linkedin.com/in/danahdunford',              email: 'dana@hemlane.com' },
  'sequel.io':           { name: 'Oana Manolache',                    title: 'CEO & Co-Founder',                       linkedin: 'https://linkedin.com/in/oana-m-manolache',          email: 'oana.m@sequel.io' },
  'tint.ai':             { name: 'Matheus Riolfi',                    title: 'Co-founder & CEO',                       linkedin: 'https://linkedin.com/in/mriolfi',                   email: 'matheus@tint.ai' },
  'briefcatch.com':      { name: 'Ross Guberman',                     title: 'Founder and CEO',                        linkedin: 'https://linkedin.com/in/ross-guberman-1303915',     email: 'ross@briefcatch.com' },
  'truewind.ai':         { name: 'Alex Lee',                          title: 'Co-founder, CEO',                        linkedin: 'https://linkedin.com/in/alex-lee-78772236',         email: '' },
  'oversee.biz':         { name: 'Aviel Siman-Tov',                   title: 'CEO & Co-Founder',                       linkedin: 'https://linkedin.com/in/aviels',                    email: '' },
  'nlx.ai':              { name: 'Andrei Papancea',                   title: 'CEO & Co-Founder',                       linkedin: 'https://linkedin.com/in/andreipapancea',            email: 'andrei@nlx.ai' },
  'augmentir.com':       { name: 'John Canosa',                       title: '',                                       linkedin: 'https://linkedin.com/in/johncanosa',                email: '' },
  'inorbit.ai':          { name: 'Florian Pestoni',                   title: 'Co-founder / CEO',                       linkedin: 'https://linkedin.com/in/florianpestoni',            email: 'florian@inorbit.ai' },
  'twinthread.com':      { name: 'Erik Udstuen',                      title: 'Co-Founder',                             linkedin: 'https://linkedin.com/in/erik-udstuen-00000',        email: 'erik.udstuen@twinthread.com' },
  'withmartian.com':     { name: 'Etan Ginsberg',                     title: '',                                       linkedin: 'https://linkedin.com/in/etanginsberg',              email: 'etan@withmartian.com' },
  'vlm.run':             { name: 'Sudeep Pillai',                     title: 'Co-Founder / CEO',                       linkedin: 'https://linkedin.com/in/sudeeppillai',              email: 'sudeep@vlm.run' },
  'coram.ai':            { name: 'Ashesh Jain',                       title: 'Co-Founder',                             linkedin: 'https://linkedin.com/in/ashesh-jain-ba53164a',      email: 'ashesh@coram.ai' },
};

// domain -> sheet row number (1-based)
const DOMAIN_TO_ROW = {
  'metal.ai': 36, 'wisor.ai': 49, 'titanintake.com': 54, 'maneva.ai': 56,
  'discern.com': 80, 'glimp.se': 86, 'mulberri.io': 89, 'nectarvet.com': 99,
  'heyarrow.com': 100, 'sage.care': 101, 'sawmills.ai': 102, 'dragonboat.io': 103,
  'openlayer.com': 104, 'aerovect.com': 105, 'quindar.space': 106, 'secro.io': 107,
  'uplinq.com': 108, 'concntric.com': 109, 'buildtrayd.com': 110, 'auxili.us': 111,
  'krane.tech': 112, 'predictap.com': 113, 'upwell.com': 114, 'userevidence.com': 115,
  'withflex.com': 116, 'virtueai.com': 117, 'remihq.com': 118, 'spoileralert.com': 119,
  'compt.io': 120, 'kalepa.com': 121, 'tryleverage.ai': 122, 'infinant.com': 123,
  'farmraise.com': 124, 'podfoods.co': 125, 'kanmon.com': 126, 'willowservicing.com': 127,
  'invertbio.com': 128, 'keragon.com': 129, 'highbyte.com': 130, 'netrise.io': 131,
  'parkade.com': 132, 'engageyourbiz.com': 133, 'enertiv.com': 134, 'signoz.io': 135,
  'strongestlayer.com': 136, 'trustlayer.io': 137, 'hemlane.com': 138, 'sequel.io': 139,
  'tint.ai': 140, 'briefcatch.com': 141, 'truewind.ai': 142, 'oversee.biz': 143,
  'nlx.ai': 144, 'augmentir.com': 145, 'inorbit.ai': 146, 'twinthread.com': 147,
  'withmartian.com': 148, 'vlm.run': 150, 'coram.ai': 151,
};

async function main() {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });

  // Read header to find column indices
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A1:I1`,
  });
  const header = headerRes.data.values?.[0] || [];
  const colCEOName     = header.indexOf('CEO Name');
  const colCEOTitle    = header.indexOf('CEO Title');
  const colCEOLinkedin = header.indexOf('CEO LinkedIn');
  const colCEOEmail    = header.indexOf('CEO Email');
  const col = n => String.fromCharCode(65 + n);

  console.log(`Header: ${header.join(', ')}`);
  console.log(`CEO Name=col ${col(colCEOName)}, Title=col ${col(colCEOTitle)}, LinkedIn=col ${col(colCEOLinkedin)}, Email=col ${col(colCEOEmail)}\n`);

  const updates = [];
  let count = 0;

  for (const [domain, data] of Object.entries(ENRICHED)) {
    const sheetRow = DOMAIN_TO_ROW[domain];
    if (!sheetRow || !data.name) continue;

    updates.push({ range: `${TAB}!${col(colCEOName)}${sheetRow}`,     values: [[data.name]] });
    updates.push({ range: `${TAB}!${col(colCEOTitle)}${sheetRow}`,    values: [[data.title]] });
    updates.push({ range: `${TAB}!${col(colCEOLinkedin)}${sheetRow}`, values: [[data.linkedin]] });
    updates.push({ range: `${TAB}!${col(colCEOEmail)}${sheetRow}`,    values: [[data.email]] });

    console.log(`  Row ${sheetRow}: ${data.name} — ${data.title || '(no title)'} | ${data.email || 'no email'}`);
    count++;
  }

  console.log(`\nWriting ${updates.length} cell updates for ${count} companies...`);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
  });

  console.log(`\n✓ Done! ${count} companies enriched.`);
}

main().catch(console.error);
