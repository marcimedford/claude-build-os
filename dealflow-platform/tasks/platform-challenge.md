---
recommendation: simplify
key_risks:
  - Email generation mechanism unresolved — static HTML cannot call Claude API without exposing keys in browser
  - Data staleness — no built-in freshness signal; file silently ages after script is run
  - Stage vocabulary mismatch unverified — Airtable "Raising Stage" vs Affinity "Preferred Deal Stage" string values not confirmed to match
open_questions:
  - What % of funds have Preferred Deal Stage populated? (if <40%, auto-filter has limited value)
  - Who runs the Python refresh script — is CLI viable for the whole team, or does it need a one-click mechanism?
  - Is AI-generated email a V1 requirement or can V1 ship with a plain-text template?
---

# Challenge: Deal Flow Platform

## Proposal Summary

Internal web tool for Innovius Capital team to share deal flow with VC fund contacts.
- Fund list from Affinity (list 117968), filtered to funds with Priority set
- Deal list from Airtable (last 1.5 months)
- Click fund → auto-filter deals by stage match
- Export as plain text or email

Proposed implementation: Python script → self-contained HTML file with embedded data.

---

## Verdict: SIMPLIFY

Proceed with the static HTML approach, but three required design decisions must be resolved before writing code.

---

## Issue 1 — Email Generation Is Architecturally Unresolved (BLOCKING)

The proposal says "export as email format" but doesn't specify how the email body is written.

**Two options with different architectures:**

| Option | How it works | Tradeoff |
|---|---|---|
| A: Static template | HTML fills in fund name + deal list into a fixed template | Ships in V1, no API key exposure, but output is generic |
| B: Claude-generated email | Python script calls Claude API at export time | Personalized output, but requires running the script (not browser-only) |

**Decision required before build:** If V1 uses a static template, the HTML file is fully self-contained and the architecture holds. If AI generation is required in V1, the Python script needs an interactive mode (run to generate email for a specific fund), and the HTML becomes a browser for fund/deal selection only, not the export mechanism.

**Recommended call:** Ship V1 with a static template. Add a `generate_email.py` script in V2 that accepts fund name as argument and outputs a Claude-generated draft.

---

## Issue 2 — Staleness Has No UX Signal (REQUIRED FIX)

The HTML file is generated once and opened in a browser. If someone opens it 10 days after the last refresh, all the "last 1.5 months" filtering logic still runs correctly — but against stale data. There's no indication the data is old.

**Required fix (low effort):** Embed the generation timestamp in the HTML. Add a JavaScript banner: if `Date.now() - generatedAt > 7 days`, show a yellow warning: "Data last refreshed [date] — run `python fetch_data.py` to update."

---

## Issue 3 — Stage Vocabulary Mismatch (VERIFY BEFORE CODING FILTER LOGIC)

Airtable stores deals with `Raising Stage` values like: "Seed", "Series A", "Series B", "Series C", "TBD"
Affinity stores fund preferences in `field-1986684` with values: "Pre-Seed", "Seed", "Series A", "Series B", "Series C+"

These mostly overlap but differ in one key way: Airtable uses the **target raise** (what the company is raising now), Affinity uses the **fund's check stage** (what they typically write). A Series A fund that invests at Series A should see companies raising Series A — those values should match directly. But "Series C+" (Affinity) vs "Series C" (Airtable) won't match on a string comparison.

**Required fix:** Build an explicit mapping table in the filter logic rather than a raw string equality check.

---

## Alternatives Evaluated

**A: Just use Airtable views**
Airtable has built-in filtering and grouping. The deal browsing part could be done entirely in Airtable. The gap is the fund-side context (stage focus, last contact) and the email export. Not viable as a complete replacement.

**B: Claude skill instead of web app**
A `/share-deals` skill could accept a fund name, look up their stage/sector focus, filter matching deals, and generate an email — all in one conversation turn. No HTML, no script to run. Viable for occasional use but not browsable; doesn't give the visual "which funds haven't been touched recently" overview.

**C: Live-data Node.js server**
Fetches Airtable and Affinity in real time on page load. Better freshness, no refresh step. Requires someone to run a server process. Overkill for an internal tool used by a small team; the static file approach is appropriate for the scale.

---

## Recommendation

Proceed with the static HTML approach. Before writing any code, get answers to:

1. **Email generation:** static template (ships faster) or Claude-generated (ships better)?
2. **Script runner:** who runs `python fetch_data.py` and how often — is CLI acceptable, or does it need a desktop shortcut / double-click batch file?
3. **Stage mismatch:** confirm the mapping table above before coding the filter

The core architecture is sound. These three decisions determine three specific code paths. Resolving them now takes 5 minutes; resolving them mid-build takes a rewrite.
