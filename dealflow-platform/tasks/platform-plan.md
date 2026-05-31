---
scope: dealflow-platform v1
surfaces_affected:
  - C:\Users\MarciMedford\Desktop\Random\dealflow-platform\fetch_data.py
  - C:\Users\MarciMedford\Desktop\Random\dealflow-platform\dealflow.html
  - C:\Users\MarciMedford\Desktop\Random\dealflow-platform\.env
  - C:\Users\MarciMedford\Desktop\Random\dealflow-platform\run.bat
verification_commands:
  - python fetch_data.py (should produce dealflow.html with no errors)
  - open dealflow.html in browser and verify fund list loads, deal filters work, export button produces text
rollback: delete dealflow-platform directory
review_tier: 1
verification_evidence: ""
---

# Plan: Deal Flow Platform v1

## Overview

A self-contained internal tool for Innovius Capital. Run a Python script twice weekly → generates a single HTML file → open in any browser to browse deals and share with investors.

## Files

```
dealflow-platform/
  fetch_data.py       # fetches Airtable + Affinity, writes dealflow.html
  dealflow.html       # generated output — open in browser
  .env                # API keys (gitignored)
  run.bat             # double-click to refresh data on Windows
  tasks/
    platform-challenge.md
    platform-plan.md
```

## Phase 1 — fetch_data.py

### Airtable fetch
- GET all records from base `appx2A1CywraYN0G8`, table `tblHYeClTmtU9V4T4`
- Paginate until all records retrieved
- Filter client-side to Date Added >= today - 45 days (1.5 months)
- Fields to extract:
  - fldcWZt7dKSrRCyZZ = Company Name
  - fldTwzM2bVwlmnZz5 = Status
  - fldTQgdL9ap6nDKr8 = Stage (last completed round)
  - fldqy0JDeHH9JdU1s = Raising Stage
  - fld0a3PC2wui33v4C = Business Type (array)
  - fldsA0S8uQBBh8DmR = Location
  - fldPVIumh8sQ7DYqc = Description
  - fldHXu2bbwvjbEQgA = Metrics
  - fldy5f3hJIjRpgPQx = Date Added
  - fldaL9z4ENAjKSfqM = Logged By

### Affinity fetch
- GET all entries from list 117968
- Paginate using cursor until all entries retrieved
- Filter to entries where field-2261288 (Priority) is NOT null
- Priority option IDs: High=13625406, Medium=5371792, Low=5371793, No Priority=10079319
- Fields to extract per fund:
  - entity.name = Fund name
  - entity.domain = Website
  - field-2261288 = Priority
  - field-1986684 = Preferred Deal Stage (array of option texts)
  - field-1986683 = Sector Focus (array of option texts)
  - field-4556538 = Fund Categorization (Feeder/Downstream/Peer)
  - field-1986680 = Innovius Contacts (person objects → extract firstName + lastName + email)
  - last-contact = Last Contact date (interaction field → extract date string)

### Stage matching logic
```python
STAGE_MAP = {
    "Seed":     ["Pre-Seed", "Seed"],
    "Series A": ["Series A"],
    "Series B": ["Series B"],
    "Series C": ["Series C+"],
    "Growth":   ["Series C+"],
    "TBD":      None,  # None = matches all funds
}

def deal_matches_fund(deal_raising_stage, fund_preferred_stages):
    if not fund_preferred_stages:  # fund has no preference set
        return True
    affinity_stages = STAGE_MAP.get(deal_raising_stage)
    if affinity_stages is None:  # TBD → show to all
        return True
    return any(s in fund_preferred_stages for s in affinity_stages)
```

### Output
- Embed deals JSON + funds JSON as JavaScript variables in dealflow.html template
- Embed generation timestamp

## Phase 2 — dealflow.html

### Layout
- Top bar: app name, "Data as of [date]", staleness warning (yellow banner if > 3 days old)
- Left panel (1/3 width): Fund list
  - Search box
  - Priority filter chips (All / High / Medium / Low / No Priority)
  - Fund cards showing: name, priority badge, categorization (Feeder/Peer/Downstream), preferred stages, last contact date
  - Click to select → filters deal panel
- Right panel (2/3 width): Deal list
  - Filter bar: Stage dropdown, Status chips, Vertical chips, search box
  - Deal cards showing: Company name, Status badge, Stage → Raising Stage, Business Type tags, Location, Description (truncated), Metrics, Date Added, Logged By
  - Deal count shown ("12 deals matching")
  - When a fund is selected: shows "Filtered for [Fund Name] — Series A, Series B" at top

### Export
- Export button (top of deal panel, appears when fund is selected)
- Opens modal with two tabs: "Text" and "Email"
- Text tab: plain list of matched deals with key info
- Email tab: formatted with subject line + body using static template (see below)
- Copy to clipboard button

### Email template
```
Subject: Deal Flow Update — [Fund Name]

Hi [Contact First Name],

Sharing a few companies we're tracking that match [Fund Name]'s focus on [stages] investing.

[For each matched deal:]
**[Company Name]** — [Stage] raise | [Location]
[Description]
[Metrics if available]

Happy to make introductions to any of these. Let me know which ones are interesting.

Best,
[Sender name]
```

### Styling
- Clean, minimal — white background, grey sidebar
- Status badges: green=Active, yellow=Tracking, red=Passed, purple=Active Diligence
- Priority badges: green=High, blue=Medium, orange=Low, grey=No Priority
- No frameworks — vanilla HTML/CSS/JS only
- Mobile not required (internal desktop tool)

## Phase 3 — Scheduling

Create `run.bat`:
```batch
@echo off
cd /d %~dp0
python fetch_data.py
echo Done. Open dealflow.html in your browser.
pause
```

Register Windows Task Scheduler task:
- Runs `run.bat` every Monday and Wednesday at 8:00 AM
- Uses `schtasks` command

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Email generation | Static template | No API key exposure in browser; V2 can add Claude generation |
| Data refresh | Mon + Wed scheduled, plus manual run.bat | Team gets fresh data twice weekly |
| Series C+ mapping | Covers Series C, D, E, Growth | Per user spec |
| Fund data freshness | Fetched at script run time | Good enough at 2x/week cadence |
| TBD raising stage | Shows to all funds | Unknown stage = don't filter it out |
| Funds with no stage pref | See all deals | Don't hide deals from funds with incomplete data |
