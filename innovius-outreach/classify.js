/**
 * classify.js — Campaign classification logic
 * Determines which email campaign type a company should receive.
 */

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * @param {object} params
 * @param {Date|null}  params.lastContactAffinity  - Last contact date from Affinity (null if none)
 * @param {number}     params.emailCount           - Number of emails sent (from Sheets)
 * @param {boolean}    params.hasResponse          - Whether any reply was ever received
 * @param {string|null} params.campaignTypeOverride - Manual override from Sheets "Campaign Type" column
 * @returns {'NET_NEW'|'WARM'|'CANNOT_BREAK_IN'|'RE_ENGAGE'}
 */
export function classifyCompany({
  lastContactAffinity,
  emailCount,
  hasResponse,
  campaignTypeOverride,
}) {
  // Manual override takes precedence
  if (campaignTypeOverride && campaignTypeOverride.trim() !== '') {
    const normalized = campaignTypeOverride.trim().toUpperCase().replace(/\s+/g, '_');
    const valid = ['NET_NEW', 'WARM', 'CANNOT_BREAK_IN', 'RE_ENGAGE'];
    if (valid.includes(normalized)) return normalized;
  }

  const emailsSent = Number(emailCount) || 0;

  if (emailsSent === 0) {
    // Check if we have an old Affinity relationship that went cold
    if (lastContactAffinity && (Date.now() - lastContactAffinity.getTime()) > NINETY_DAYS_MS) {
      return 'RE_ENGAGE';
    }
    return 'NET_NEW';
  }

  if (emailsSent >= 4 && !hasResponse) {
    return 'CANNOT_BREAK_IN';
  }

  if (emailsSent >= 1 && emailsSent <= 3) {
    return 'WARM';
  }

  // Affinity relationship that went cold (90+ days since last any contact)
  if (lastContactAffinity && (Date.now() - lastContactAffinity.getTime()) > NINETY_DAYS_MS) {
    return 'RE_ENGAGE';
  }

  return 'WARM';
}

/**
 * How many emails does each campaign type produce?
 */
export const CAMPAIGN_EMAIL_COUNTS = {
  NET_NEW: 6,
  WARM: 4,
  CANNOT_BREAK_IN: 3,
  RE_ENGAGE: 4,
};

/**
 * Pick the right dinner invite based on company city.
 */
export function getDinnerInvite(cityState) {
  if (!cityState) return 'NONE';
  const lower = cityState.toLowerCase();
  if (lower.includes('san francisco') || lower.includes(' sf') || lower.includes('bay area') || lower.includes('oakland') || lower.includes('palo alto') || lower.includes('menlo park') || lower.includes('san jose')) {
    return process.env.DINNER_SF_EVENT || 'CARTA_SF_MAY9';
  }
  if (lower.includes('new york') || lower.includes(' nyc') || lower.includes('brooklyn') || lower.includes('manhattan')) {
    return process.env.DINNER_NYC_EVENT || 'CLAY_NYC_JUNE24';
  }
  return 'NONE';
}
