/**
 * affinity.js — Affinity CRM API wrapper
 * Docs: https://api.affinity.co
 */

import 'dotenv/config';
import fetch from 'node-fetch';

const BASE_URL = 'https://api.affinity.co';

function authHeader() {
  const key = process.env.AFFINITY_API_KEY;
  if (!key) throw new Error('AFFINITY_API_KEY not set in .env');
  // Affinity uses HTTP Basic Auth: username is empty, password is the API key
  const encoded = Buffer.from(`:${key}`).toString('base64');
  return { Authorization: `Basic ${encoded}`, 'Content-Type': 'application/json' };
}

async function request(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: authHeader() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Affinity API ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Search Affinity organizations by domain or name.
 * Returns the best-matching company object or null.
 */
export async function getCompanyByDomain(domain) {
  // Affinity doesn't have a direct domain endpoint — search by name/domain
  const data = await request('/organizations', { term: domain, page_size: 5 });
  const orgs = data.organizations || [];
  // Prefer exact domain match
  const match = orgs.find(o =>
    (o.domains || []).some(d => d.toLowerCase().includes(domain.toLowerCase()))
  ) || orgs[0] || null;

  if (!match) return null;

  return {
    id: match.id,
    name: match.name,
    domain: (match.domains || [])[0] || domain,
    owner: match.owner_id || null,
    listMemberships: (match.list_entries || []).map(e => e.list_id),
  };
}

/**
 * Get the last email date and owner for a company by its Affinity organization ID.
 * Uses with_interaction_dates=true to get first/last email dates.
 */
export async function getLastContact(organizationId) {
  const data = await request(`/organizations/${organizationId}`, {
    with_interaction_dates: 'true',
  });

  const dates = data.interaction_dates || {};
  const notes = await getNotes(organizationId);

  return {
    firstEmailDate: dates.first_email_date ? new Date(dates.first_email_date) : null,
    lastEmailDate: dates.last_email_date ? new Date(dates.last_email_date) : null,
    lastEventDate: dates.last_event_date ? new Date(dates.last_event_date) : null,
    // lastContactDate = most recent of email or event
    lastContactDate: [dates.last_email_date, dates.last_event_date]
      .filter(Boolean)
      .map(d => new Date(d))
      .sort((a, b) => b - a)[0] || null,
    owner: data.owner_id || null,
    notes: notes.slice(0, 5).map(n => n.content),
  };
}

/**
 * Get notes for an organization.
 */
export async function getNotes(organizationId) {
  const data = await request('/notes', {
    organization_id: organizationId,
    page_size: 25,
  });
  return (data.notes || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/**
 * Search organizations by name query.
 */
export async function searchCompanies(query) {
  const data = await request('/organizations', { term: query, page_size: 10 });
  return (data.organizations || []).map(o => ({
    id: o.id,
    name: o.name,
    domain: (o.domains || [])[0] || '',
  }));
}

/**
 * Convenience: get everything we need for classification in one call.
 * Returns null if company not found in Affinity.
 */
export async function getAffinityProfile(domain) {
  try {
    const company = await getCompanyByDomain(domain);
    if (!company) return null;

    const contact = await getLastContact(company.id);
    return { ...company, ...contact };
  } catch (err) {
    console.warn(`[Affinity] Could not fetch profile for ${domain}: ${err.message}`);
    return null;
  }
}
