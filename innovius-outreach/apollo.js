/**
 * apollo.js — Apollo.io CSV export
 * Generates a CSV ready to import as an Apollo sequence.
 */

import { stringify } from 'csv-stringify/sync';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { CAMPAIGN_EMAIL_COUNTS } from './classify.js';

/**
 * Build Apollo CSV rows from an array of campaign results.
 *
 * @param {Array<{company, campaignType, campaign}>} results
 * @returns {string} CSV string
 */
export function buildApolloCSV(results) {
  if (results.length === 0) return '';

  // Find max email count across all campaigns
  const maxEmails = Math.max(...results.map(r => CAMPAIGN_EMAIL_COUNTS[r.campaignType] || 6));

  // Build headers
  const headers = [
    'First Name',
    'Last Name',
    'Email',
    'Company',
    'Title',
    'Campaign Type',
    'City',
  ];
  for (let i = 1; i <= maxEmails; i++) {
    headers.push(`Email ${i} Subject`);
    headers.push(`Email ${i} Body`);
  }

  const rows = results.map(({ company, campaignType, campaign }) => {
    const [firstName, ...lastParts] = (company.founderName || '').split(' ');
    const lastName = lastParts.join(' ');

    const row = [
      firstName || '',
      lastName || '',
      company.founderEmail || '',
      company.companyName || '',
      '',
      campaignType,
      company.cityState || '',
    ];

    for (let i = 1; i <= maxEmails; i++) {
      const email = campaign[`email_${i}`];
      row.push(email?.subject || '');
      row.push(email?.body || '');
    }

    return row;
  });

  return stringify([headers, ...rows]);
}

/**
 * Write Apollo CSV to disk.
 * Returns the file path.
 */
export async function exportToApollo(results, outputDir = '.') {
  const csv = buildApolloCSV(results);
  const date = new Date().toISOString().split('T')[0];
  const filename = `innovius_apollo_${date}.csv`;
  const filePath = join(outputDir, filename);
  await writeFile(filePath, csv, 'utf8');
  return filePath;
}
