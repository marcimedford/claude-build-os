/**
 * affinity-mcp-server.js — Affinity CRM as an MCP server
 * Run with: node affinity-mcp-server.js
 * Connect via stdio transport in your MCP client config.
 */

import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getCompanyByDomain, getLastContact, searchCompanies, getNotes } from './affinity.js';

const server = new McpServer({
  name: 'affinity-mcp',
  version: '1.0.0',
});

// Tool: get_company
server.tool(
  'get_company',
  'Get Affinity company profile by domain. Returns name, last contact date, owner, notes, and list memberships.',
  { domain: z.string().describe('Company domain, e.g. ollihealth.com') },
  async ({ domain }) => {
    const company = await getCompanyByDomain(domain);
    if (!company) {
      return {
        content: [{ type: 'text', text: `No company found in Affinity for domain: ${domain}` }],
      };
    }
    const contact = await getLastContact(company.id);
    const result = { ...company, ...contact };
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: get_interactions
server.tool(
  'get_interactions',
  'Get interaction history (emails, meetings, notes) for a company by Affinity organization ID.',
  {
    company_id: z.number().describe('Affinity organization ID'),
    limit: z.number().optional().default(20).describe('Max interactions to return'),
  },
  async ({ company_id, limit }) => {
    const BASE_URL = 'https://api.affinity.co';
    const key = process.env.AFFINITY_API_KEY;
    const encoded = Buffer.from(`:${key}`).toString('base64');

    const { default: fetch } = await import('node-fetch');
    const url = new URL(`${BASE_URL}/interactions`);
    url.searchParams.set('organization_id', company_id);
    url.searchParams.set('page_size', limit);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Basic ${encoded}` },
    });
    const data = await res.json();
    const interactions = (data.interactions || []).slice(0, limit);

    const notes = await getNotes(company_id);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ interactions, notes: notes.slice(0, 10) }, null, 2),
      }],
    };
  }
);

// Tool: search_companies
server.tool(
  'search_companies',
  'Search Affinity for companies by name or keyword.',
  { query: z.string().describe('Search query, e.g. company name or space') },
  async ({ query }) => {
    const companies = await searchCompanies(query);
    return {
      content: [{ type: 'text', text: JSON.stringify(companies, null, 2) }],
    };
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[Affinity MCP] Server running on stdio');
