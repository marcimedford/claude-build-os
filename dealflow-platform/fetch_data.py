#!/usr/bin/env python3
"""
Innovius Capital Deal Flow Platform
Fetches data from Airtable + Affinity and generates dealflow.html
"""

import json
import os
import base64
import sys
from datetime import datetime, timezone, timedelta
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError


# ---------------------------------------------------------------------------
# .env loader (no external dependencies)
# ---------------------------------------------------------------------------

def load_env(path):
    env = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, _, val = line.partition("=")
                    env[key.strip()] = val.strip()
    except FileNotFoundError:
        print(f"ERROR: .env file not found at {path}")
        sys.exit(1)
    return env


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def http_get(url, headers):
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code} from {url}: {body[:300]}")
        raise
    except URLError as e:
        print(f"URL error fetching {url}: {e.reason}")
        raise


# ---------------------------------------------------------------------------
# Airtable fetch
# ---------------------------------------------------------------------------

def fetch_airtable(pat, base_id, table_id):
    """Fetch all records from Airtable table, paginating with offset."""
    base_url = f"https://api.airtable.com/v0/{base_id}/{table_id}"
    headers = {"Authorization": f"Bearer {pat}"}
    records = []
    offset = None

    print("Fetching Airtable records...")
    page = 0
    while True:
        page += 1
        url = base_url + "?pageSize=100&returnFieldsByFieldId=true"
        if offset:
            url += f"&offset={offset}"
        data = http_get(url, headers)
        batch = data.get("records", [])
        records.extend(batch)
        print(f"  Page {page}: {len(batch)} records (total so far: {len(records)})")
        offset = data.get("offset")
        if not offset:
            break

    print(f"  Total records fetched: {len(records)}")
    return records


def _normalize_field_value(v):
    """Convert MCP-format select values ({id, name, color}) to plain strings."""
    if isinstance(v, dict) and "name" in v:
        return v["name"]
    if isinstance(v, list):
        return [_normalize_field_value(i) for i in v]
    return v


def load_airtable_json(path):
    """Load pre-fetched Airtable records written by a Cowork task via MCP.

    Accepts:
      - bare array: [{id, fields/cellValuesByFieldId}, ...]
      - wrapped:    {records: [{id, fields/cellValuesByFieldId}, ...]}

    MCP returns select fields as {id, name, color} objects; this normalizes
    them to plain strings so parse_airtable_records sees the same format as
    the REST API.
    """
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    records_raw = data["records"] if isinstance(data, dict) and "records" in data else data
    records = []
    for rec in records_raw:
        fields_raw = rec.get("fields") or rec.get("cellValuesByFieldId") or {}
        fields = {k: _normalize_field_value(v) for k, v in fields_raw.items()}
        records.append({"id": rec.get("id", ""), "fields": fields})
    print(f"  Loaded {len(records)} records from {path}")
    return records


# Airtable field IDs
CATEGORY_FIELD_ID = "fldHGEY6xvpWR4f1G"   # Category: "In Market" | "On Our Radar"
BT_FIELD_ID_CONST = "fld0a3PC2wui33v4C"    # Business Type (multiSelect)

# Keywords used to infer "In Market" category when Category field is blank.
# Primary signal: Raise Amount field is populated (checked separately in parse).
# Secondary: clear fundraising language in description or metrics.
IN_MARKET_KEYWORDS = [
    "raising", "raise a", "raise their", "in market", "in fundraise",
    "fundraising", "seeking to raise", "closing a", "soft circle",
    "term sheet", "pre-money", "post-money",
]
RAISE_AMOUNT_FIELD_ID = "fldqX7HZ1rjZDQK65"

# ---------------------------------------------------------------------------
# Business-type taxonomy (shared by parse + write-back)
# ---------------------------------------------------------------------------

BT_NORM = {
    # Removed categories (map to None → strip)
    "AI": None, "SaaS": None, "TBD": None, "AI / TBD": None,
    # Fintech consolidation
    "Financial Services": "Fintech", "Fintech / Payments": "Fintech",
    "Fintech/Payments": "Fintech", "Fintech / Digital Assets": "Fintech",
    "Fintech / Nonprofit": "Fintech", "Marketplace / SMB M&A": "Fintech",
    # GTM
    "MarTech / Sales Tech": "GTM", "MarTech/Sales Tech": "GTM",
    "GTM Tech": "GTM", "GTM / Sales AI": "GTM", "GTM Tech / Events": "GTM",
    "B2B SaaS / RevOps": "GTM", "RevOps / AI": "GTM", "AI / Media Tech": "GTM",
    # Energy & Utilities
    "Energy": "Energy & Utilities", "Utilities / SaaS": "Energy & Utilities",
    "CleanTech / SaaS": "Energy & Utilities",
    # Legal Tech
    "Legal Tech / RegTech": "Legal Tech", "Legal Tech/RegTech": "Legal Tech",
    "Legal Tech / Vertical SaaS": "Legal Tech",
    # Healthcare
    "Healthcare / AI": "Healthcare", "SaaS / HealthTech": "Healthcare",
    # Life Sciences
    "Pharma / Vertical SaaS": "Life Sciences",
    # Cybersecurity
    "Cybersecurity / DevSecOps": "Cybersecurity", "Cybersecurity / Enterprise": "Cybersecurity",
    "Cybersecurity / Hardware": "Cybersecurity", "Cybersecurity / Identity": "Cybersecurity",
    "Computer Vision / Security": "Cybersecurity", "Identity Verification": "Cybersecurity",
    # Construction
    "Construction Tech": "Construction", "Construction / SaaS": "Construction",
    # Manufacturing
    "Robotics / Infrastructure": "Manufacturing", "AI / Manufacturing": "Manufacturing",
    # Logistics
    "Logistics / E-commerce": "Logistics / Supply Chain",
    "Logistics / Vertical SaaS": "Logistics / Supply Chain",
    "E-commerce / Infrastructure": "Logistics / Supply Chain",
    "AI / Supply Chain": "Logistics / Supply Chain",
    # Vertical SaaS
    "Vertical SaaS / Field Services": "Vertical SaaS", "Vertical SaaS / Restaurant": "Vertical SaaS",
    "Vertical SaaS / Self Storage": "Vertical SaaS", "Vertical SaaS / Waste": "Vertical SaaS",
    "Telecom / Vertical SaaS": "Vertical SaaS", "AI / Franchise Tech": "Vertical SaaS",
    "Consumer / Pet Services": "Vertical SaaS",
    # Developer Tools
    "DevOps / SaaS": "Developer Tools", "AI / Knowledge Work": "Developer Tools",
    # AI Infrastructure
    "Data / AI": "AI Infrastructure",
    # HR
    "HR Tech / L&D": "HR / Workforce Tech",
    # GovTech
    "GovTech / Public Safety": "GovTech", "GovTech / Vertical SaaS": "GovTech",
}

BT_FIELD_ID = "fld0a3PC2wui33v4C"


def _apply_bt_norm(tags):
    """Return sorted canonical tag list for a given raw tag list."""
    normalized = set()
    for t in (tags or []):
        if t == "Healthcare / Life Sciences":
            normalized.add("Healthcare")
            normalized.add("Life Sciences")
            continue
        mapped = BT_NORM.get(t, t)
        if mapped is not None:
            normalized.add(mapped)
    return sorted(normalized)


def normalize_airtable_taxonomy(pat, base_id, table_id, raw_records):
    """
    Patch any Airtable records whose business_type tags don't match the
    canonical taxonomy.  Runs on every fetch so stale tags written by
    external tools (e.g. Claude Cowork) are cleaned up automatically.
    """
    base_url = f"https://api.airtable.com/v0/{base_id}/{table_id}"
    headers = {
        "Authorization": f"Bearer {pat}",
        "Content-Type": "application/json",
    }

    to_patch = []
    for rec in raw_records:
        raw_tags = rec.get("fields", {}).get(BT_FIELD_ID)
        if isinstance(raw_tags, str):
            raw_tags = [raw_tags]
        elif not isinstance(raw_tags, list):
            raw_tags = []

        canonical = _apply_bt_norm(raw_tags)
        if sorted(raw_tags) != canonical:
            to_patch.append({"id": rec["id"], "tags": canonical})

    if not to_patch:
        print("  Taxonomy: all records already clean — no patches needed.")
        return

    print(f"  Taxonomy: patching {len(to_patch)} records with stale tags...")

    # Airtable PATCH accepts up to 10 records per request
    errors = 0
    patched = 0
    for i in range(0, len(to_patch), 10):
        batch = to_patch[i:i + 10]
        payload = json.dumps({
            "records": [
                {"id": r["id"], "fields": {BT_FIELD_ID: r["tags"]}}
                for r in batch
            ],
            "typecast": True,
        }).encode("utf-8")
        req = Request(base_url, data=payload, headers=headers, method="PATCH")
        try:
            with urlopen(req, timeout=30) as resp:
                resp.read()
            patched += len(batch)
        except HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            print(f"  PATCH error (batch {i // 10 + 1}): HTTP {e.code} — {body[:200]}")
            errors += 1
        except URLError as e:
            print(f"  PATCH error (batch {i // 10 + 1}): {e.reason}")
            errors += 1

    if errors:
        print(f"  Taxonomy: {patched} patched, {errors} batch(es) failed.")
    else:
        print(f"  Taxonomy: {patched} records updated.")


# Normalize Airtable raising stage values to a standard set
RAISING_STAGE_NORM = {
    "growth / late stage": "Growth",
    "late stage": "Growth",
    "series d+": "Growth",
    "series d": "Growth",
    "series e": "Growth",
    "series c+": "Series C",
}

def normalize_raising_stage(s):
    if not s:
        return s
    return RAISING_STAGE_NORM.get(s.strip().lower(), s.strip())


def parse_airtable_records(raw_records):
    """Filter to last 45 days and extract relevant fields."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=45)
    deals = []

    for rec in raw_records:
        fields = rec.get("fields", {})

        date_added_str = fields.get("fldy5f3hJIjRpgPQx")
        if not date_added_str:
            continue

        # Parse date_added — Airtable returns ISO 8601 or YYYY-MM-DD
        try:
            if "T" in date_added_str:
                date_added = datetime.fromisoformat(date_added_str.replace("Z", "+00:00"))
            else:
                date_added = datetime.fromisoformat(date_added_str).replace(tzinfo=timezone.utc)
        except ValueError:
            continue

        if date_added < cutoff:
            continue

        # Extract fields
        business_type = fields.get("fld0a3PC2wui33v4C")
        if isinstance(business_type, str):
            business_type = [business_type]
        elif not isinstance(business_type, list):
            business_type = []
        # Normalize to clean taxonomy using shared BT_NORM map
        business_type = _apply_bt_norm(business_type)

        logged_by = fields.get("fldaL9z4ENAjKSfqM")
        if isinstance(logged_by, list):
            logged_by = ", ".join(str(x) for x in logged_by)

        # Status: Tracking / Passed / Active Diligence - Do Not Share
        # "Active" in Airtable is treated as Tracking for display purposes.
        raw_status = fields.get("fldTwzM2bVwlmnZz5") or ""
        if raw_status not in ("Tracking", "Passed", "Active Diligence - Do Not Share"):
            raw_status = "Tracking"  # catches "Active" and any unknowns

        # Category: "In Market" = actively fundraising right now.
        # Signals (in priority order):
        #   1. Explicitly set in Airtable Category field
        #   2. Status is Active Diligence - Do Not Share
        #   3. Raise Amount field is populated
        #   4. Fundraising keywords in description or metrics
        # Everything else = "On Our Radar"
        category = fields.get(CATEGORY_FIELD_ID) or ""
        if not category:
            raise_amount = fields.get(RAISE_AMOUNT_FIELD_ID) or ""
            description = fields.get("fldPVIumh8sQ7DYqc") or ""
            metrics = fields.get("fldHXu2bbwvjbEQgA") or ""
            haystack = (description + " " + metrics).lower()
            if (raw_status == "Active Diligence - Do Not Share"
                    or raise_amount
                    or any(kw in haystack for kw in IN_MARKET_KEYWORDS)):
                category = "In Market"
            else:
                category = "On Our Radar"

        # Founded year (number → string for display)
        founded_raw = fields.get("fldm4y3AQlXwSVv7k")
        founded = str(int(founded_raw)) if founded_raw else ""

        # Total raised — accepts raw number (21000000) or pre-formatted string ("$21M")
        total_raised_raw = fields.get("fldsXvC2Bz8jDDGD2")
        if total_raised_raw:
            try:
                amt = float(str(total_raised_raw).replace(",", ""))
                if amt >= 1_000_000_000:
                    total_raised = f"${amt / 1_000_000_000:.1f}B"
                elif amt >= 1_000_000:
                    total_raised = f"${amt / 1_000_000:.1f}M"
                elif amt >= 1_000:
                    total_raised = f"${amt / 1_000:.0f}K"
                else:
                    total_raised = f"${amt:,.0f}"
            except ValueError:
                total_raised = str(total_raised_raw)
        else:
            total_raised = ""

        deals.append({
            "id": rec.get("id", ""),
            "company_name": fields.get("fldcWZt7dKSrRCyZZ") or "",
            "category": category,
            "status": raw_status,
            "stage": fields.get("fldTQgdL9ap6nDKr8") or "",
            "raising_stage": normalize_raising_stage(fields.get("fldqy0JDeHH9JdU1s") or ""),
            "business_type": business_type,
            "location": fields.get("fldsA0S8uQBBh8DmR") or "",
            "founded": founded,
            "total_raised": total_raised,
            "description": fields.get("fldPVIumh8sQ7DYqc") or "",
            "metrics": fields.get("fldHXu2bbwvjbEQgA") or "",
            "raise_amount": fields.get(RAISE_AMOUNT_FIELD_ID) or "",
            "date_added": date_added_str,
            "logged_by": logged_by or "",
        })

    print(f"  Deals after 45-day filter: {len(deals)}")
    return deals


# ---------------------------------------------------------------------------
# Affinity fetch
# ---------------------------------------------------------------------------

def affinity_headers(api_key):
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def fetch_affinity(api_key, list_id):
    """Fetch all list entries from Affinity v2 API, paginating with cursor."""
    headers = affinity_headers(api_key)
    next_url = (
        f"https://api.affinity.co/v2/lists/{list_id}/list-entries"
        f"?limit=100&fieldTypes=relationship-intelligence&fieldTypes=list"
    )
    entries = []

    print("Fetching Affinity fund entries...")
    page = 0
    while next_url:
        page += 1
        data = http_get(next_url, headers)
        batch = data.get("data", [])
        entries.extend(batch)
        print(f"  Page {page}: {len(batch)} entries (total so far: {len(entries)})")
        next_url = data.get("pagination", {}).get("nextUrl")

    print(f"  Total entries fetched: {len(entries)}")
    return entries


def find_field(entity_fields, field_id):
    """Find a field by id in entity.fields array and return its value data."""
    for f in entity_fields:
        if f.get("id") == field_id:
            return (f.get("value") or {}).get("data")
    return None


def parse_affinity_entries(raw_entries):
    """Extract fund data. Filter: Status (field-1986685) must be set (High/Medium/Low/No Priority tiers)."""
    funds = []

    for entry in raw_entries:
        entity = entry.get("entity", {})
        fields = entity.get("fields", [])  # v2: fields live in entity, not entry

        # Status (field-1986685): ranked-dropdown, data = {"text": "High Priority"/"Medium Priority"/...}
        status_data = find_field(fields, "field-1986685")
        if not status_data or not isinstance(status_data, dict):
            continue
        status_text = status_data.get("text", "")
        if not status_text:
            continue

        # Map Status → priority badge
        st_lower = status_text.lower()
        if "high" in st_lower:
            priority = "High"
        elif "medium" in st_lower:
            priority = "Medium"
        elif "low" in st_lower:
            priority = "Low"
        else:
            priority = "No Priority"

        # Preferred Deal Stage (field-1986684): dropdown-multi
        stages_data = find_field(fields, "field-1986684")
        preferred_stages = []
        if isinstance(stages_data, list):
            preferred_stages = [item.get("text", "") for item in stages_data if isinstance(item, dict) and item.get("text")]

        # Sector Focus (field-1986683): dropdown-multi
        sector_data = find_field(fields, "field-1986683")
        sector_focus = []
        if isinstance(sector_data, list):
            sector_focus = [item.get("text", "") for item in sector_data if isinstance(item, dict) and item.get("text")]

        # Fund Categorization (field-4556538): dropdown-multi
        cat_data = find_field(fields, "field-4556538")
        fund_categorization = []
        if isinstance(cat_data, list):
            fund_categorization = [item.get("text", "") for item in cat_data if isinstance(item, dict) and item.get("text")]

        # Innovius Contacts (field-1986680): person-multi
        contacts_data = find_field(fields, "field-1986680")
        innovius_contacts = []
        if isinstance(contacts_data, list):
            for person in contacts_data:
                if isinstance(person, dict):
                    innovius_contacts.append({
                        "firstName": person.get("firstName", ""),
                        "lastName": person.get("lastName", ""),
                        "email": person.get("primaryEmailAddress", ""),
                    })

        # Last contact: field id="last-contact", value.data.startTime (meeting) or sentAt (email)
        last_contact_date = None
        for f in fields:
            if f.get("id") == "last-contact":
                lc_data = (f.get("value") or {}).get("data")
                if lc_data and isinstance(lc_data, dict):
                    raw = lc_data.get("startTime") or lc_data.get("sentAt")
                    if raw:
                        last_contact_date = str(raw)[:10]
                break

        funds.append({
            "name": entity.get("name") or "",
            "domain": entity.get("domain") or "",
            "priority": priority,
            "preferred_stages": preferred_stages,
            "sector_focus": sector_focus,
            "fund_categorization": fund_categorization,
            "innovius_contacts": innovius_contacts,
            "last_contact_date": last_contact_date,
        })

    priority_order = {"High": 0, "Medium": 1, "Low": 2, "No Priority": 3}
    funds.sort(key=lambda f: (priority_order.get(f["priority"], 4), f["name"].lower()))
    print(f"  Funds with Status set: {len(funds)}")
    return funds


# ---------------------------------------------------------------------------
# HTML template
# ---------------------------------------------------------------------------

HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Innovius Capital — Deal Flow</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 15px;
  background: #F9F9F9;
  color: #142B11;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Top bar */
#topbar {
  background: #142B11;
  color: #fff;
  padding: 10px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}
#topbar h1 { font-size: 16px; font-weight: 600; letter-spacing: 0.5px; }
#topbar .meta { font-size: 12px; color: #9ca3af; margin-left: auto; }

/* Staleness banner */
#stale-banner {
  background: #fef3c7;
  border-bottom: 1px solid #f59e0b;
  color: #92400e;
  padding: 7px 20px;
  font-size: 13px;
  flex-shrink: 0;
  display: none;
}

/* Main layout */
#main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Left panel — Funds */
#fund-panel {
  width: 320px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
#fund-panel-header {
  padding: 14px 16px 10px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}
#fund-panel-header h2 { font-size: 14px; font-weight: 600; margin-bottom: 10px; }
#fund-search {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 8px;
  outline: none;
}
#fund-search:focus { border-color: #142B11; box-shadow: 0 0 0 2px rgba(20,43,17,0.15); }
.pill-group { display: flex; flex-wrap: wrap; gap: 5px; }
.pill {
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  cursor: pointer;
  background: #fff;
  color: #374151;
  transition: background 0.15s, color 0.15s;
}
.pill:hover { background: #f3f4f6; }
.pill:focus { outline: 2px solid #142B11; outline-offset: 1px; }
.pill.active { background: #142B11; color: #B4FFB6; border-color: #142B11; }

#fund-list { overflow-y: auto; flex: 1; padding: 8px; }

.fund-card {
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.fund-card:hover { border-color: #142B11; box-shadow: 0 0 0 2px rgba(20,43,17,0.1); }
.fund-card:focus { outline: 2px solid #142B11; outline-offset: 1px; }
.fund-card.selected { border-color: #142B11; background: #edfaed; box-shadow: 0 0 0 2px rgba(20,43,17,0.15); }
.fund-card-name { font-weight: 600; font-size: 14px; margin-bottom: 5px; }
.fund-card-meta { font-size: 12px; color: #6b7280; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.fund-card-stages { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.tag { padding: 2px 7px; border-radius: 4px; font-size: 11px; background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; }
.tag.cat { background: #e8f5e8; color: #142B11; border-color: #a5d6a7; }

/* Priority badges */
.badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.badge-high { background: #d1fae5; color: #065f46; }
.badge-medium { background: #dbeafe; color: #1e40af; }
.badge-low { background: #ffedd5; color: #9a3412; }
.badge-nopriority { background: #f3f4f6; color: #6b7280; }

/* Status badges */
.badge-active { background: #d1fae5; color: #065f46; }
.badge-tracking { background: #fef3c7; color: #92400e; }
.badge-passed { background: #fee2e2; color: #991b1b; }
.badge-diligence { background: #e0e7ff; color: #3730a3; }

/* Category badges */
.cat-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.cat-inmarket { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
.cat-radar { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }

/* Right panel — Deals */
#deal-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}
#deal-panel-header {
  padding: 12px 16px 10px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
  flex-shrink: 0;
}
#deal-header-row1 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
#deal-title { font-size: 14px; font-weight: 600; }
#deal-count { font-size: 13px; color: #6b7280; }
#clear-fund-btn {
  display: none;
  background: none;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
  color: #374151;
}
#clear-fund-btn:hover { background: #f3f4f6; }
#clear-fund-btn:focus { outline: 2px solid #142B11; outline-offset: 1px; }
#export-btn {
  margin-left: auto;
  padding: 6px 14px;
  background: #142B11;
  color: #B4FFB6;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}
#export-btn:hover { background: #1a3617; }
#export-btn:focus { outline: 2px solid #142B11; outline-offset: 2px; }
.filter-row { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 6px; }
#deal-search {
  width: 100%;
  max-width: 300px;
  padding: 5px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
}
#deal-search:focus { border-color: #142B11; box-shadow: 0 0 0 2px rgba(20,43,17,0.15); }

/* Deal list */
#deal-list { overflow-y: auto; flex: 1; padding: 12px 16px; }

.deal-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 10px;
}
.deal-card-header { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
.deal-card-name { font-weight: 700; font-size: 15px; flex: 1; }
.deal-card-actions { flex-shrink: 0; }
.status-select {
  appearance: none;
  border: none;
  border-radius: 10px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  outline: none;
}
.status-select:focus { box-shadow: 0 0 0 2px rgba(20,43,17,0.4); }
.status-select { min-width: 80px; }
.status-select.badge-active { background: #d1fae5; color: #065f46; }
.status-select.badge-tracking { background: #fef3c7; color: #92400e; }
.status-select.badge-passed { background: #fee2e2; color: #991b1b; }
.status-select.badge-diligence { background: #e0e7ff; color: #3730a3; }
.deal-card-stage { font-size: 13px; color: #6b7280; margin-bottom: 6px; }
.deal-card-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.deal-card-location { font-size: 12px; color: #9ca3af; margin-bottom: 4px; }
.deal-card-funding-meta { font-size: 12px; color: #6b7280; margin-bottom: 6px; }
.deal-card-desc {
  font-size: 13px;
  color: #374151;
  line-height: 1.5;
  cursor: pointer;
  margin-bottom: 6px;
}
.deal-card-metrics {
  font-size: 12px;
  color: #374151;
  background: #f8f9fa;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 6px 10px;
  margin-bottom: 6px;
  white-space: pre-wrap;
}
.deal-card-footer { font-size: 12px; color: #9ca3af; }
.diligence-share-label { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #3730a3; background: #e0e7ff; border-radius: 6px; padding: 4px 10px; margin: 6px 0; cursor: pointer; }
.diligence-share-label input { cursor: pointer; accent-color: #142B11; }

.no-results { text-align: center; color: #9ca3af; padding: 40px 20px; font-size: 14px; }

/* Export modal */
#modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 100;
  align-items: center;
  justify-content: center;
}
#modal-overlay.open { display: flex; }
#modal {
  background: #fff;
  border-radius: 10px;
  width: 640px;
  max-width: 95vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
}
#modal-header {
  padding: 16px 20px 12px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
}
#modal-title { font-weight: 600; font-size: 15px; flex: 1; }
#modal-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #6b7280;
  padding: 2px 6px;
  border-radius: 4px;
}
#modal-close:hover { background: #f3f4f6; }
#modal-close:focus { outline: 2px solid #142B11; outline-offset: 1px; }
.tab-bar { display: flex; border-bottom: 1px solid #e5e7eb; padding: 0 20px; }
.tab-btn {
  padding: 10px 16px;
  border: none;
  background: none;
  font-size: 14px;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tab-btn:hover { color: #142B11; }
.tab-btn:focus { outline: 2px solid #142B11; outline-offset: -2px; }
.tab-btn.active { color: #142B11; border-bottom-color: #142B11; font-weight: 600; }
.tab-content { display: none; padding: 16px 20px; flex: 1; overflow-y: auto; }
.tab-content.active { display: flex; flex-direction: column; gap: 10px; }
#modal-footer {
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.modal-btn {
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
}
.modal-btn:hover { background: #f3f4f6; }
.modal-btn:focus { outline: 2px solid #142B11; outline-offset: 1px; }
.modal-btn.primary { background: #142B11; color: #B4FFB6; border-color: #142B11; }
.modal-btn.primary:hover { background: #1a3617; }
#email-subject {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
}
#email-subject:focus { border-color: #142B11; box-shadow: 0 0 0 2px rgba(20,43,17,0.15); }
#email-body, #text-output {
  width: 100%;
  flex: 1;
  min-height: 280px;
  padding: 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  outline: none;
  line-height: 1.55;
}
#email-body:focus, #text-output:focus { border-color: #142B11; box-shadow: 0 0 0 2px rgba(20,43,17,0.15); }
.copied-flash { color: #065f46; font-size: 12px; display: none; }

/* Deal picker in export modal */
#deal-picker { overflow-y: auto; max-height: 260px; padding: 10px 20px; border-bottom: 1px solid #e5e7eb; }
.picker-section { margin-bottom: 12px; }
.picker-section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #f3f4f6; }
.picker-section-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #142B11; }
.check-all-btn { font-size: 11px; color: #6b7280; background: none; border: 1px solid #e5e7eb; border-radius: 4px; padding: 2px 8px; cursor: pointer; }
.check-all-btn:hover { background: #f3f4f6; }
.picker-deal { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; }
.picker-deal input[type="checkbox"] { cursor: pointer; accent-color: #142B11; flex-shrink: 0; }
.picker-deal-name { font-weight: 500; }
.picker-deal-stage { color: #6b7280; font-size: 12px; }
.picker-empty { color: #9ca3af; font-size: 12px; padding: 4px 0; }
</style>
</head>
<body>

<div id="topbar">
  <h1>Innovius Capital — Deal Flow</h1>
  <span class="meta" id="generated-label"></span>
</div>
<div id="stale-banner">
  ⚠ Data last refreshed <span id="stale-date"></span> — run <code>fetch_data.py</code> to update
</div>

<div id="main">
  <!-- Left: Funds -->
  <div id="fund-panel">
    <div id="fund-panel-header">
      <h2>VC Funds (<span id="fund-count">0</span>)</h2>
      <input type="search" id="fund-search" placeholder="Search funds…" aria-label="Search funds">
      <div class="pill-group" id="priority-pills">
        <button class="pill active" data-priority="all">All</button>
        <button class="pill" data-priority="High Priority">High</button>
        <button class="pill" data-priority="Medium Priority">Medium</button>
        <button class="pill" data-priority="Low Priority">Low</button>
      </div>
    </div>
    <div id="fund-list" role="list" aria-label="Fund list"></div>
  </div>

  <!-- Right: Deals -->
  <div id="deal-panel">
    <div id="deal-panel-header">
      <div id="deal-header-row1">
        <span id="deal-title">All Deals (last 45 days)</span>
        <span id="deal-count" class="deal-count"></span>
        <button id="clear-fund-btn" aria-label="Clear fund filter">× Clear</button>
        <button id="export-btn">Export All</button>
      </div>
      <div class="filter-row" id="stage-pills">
        <button class="pill active" data-stage="all">All Stages</button>
        <button class="pill" data-stage="Seed">Seed</button>
        <button class="pill" data-stage="Series A">Series A</button>
        <button class="pill" data-stage="Series B">Series B</button>
        <button class="pill" data-stage="Series C">Series C</button>
        <button class="pill" data-stage="Growth">Growth</button>
        <button class="pill" data-stage="TBD">TBD</button>
      </div>
      <div class="filter-row" id="category-pills">
        <button class="pill active" data-category="all">All</button>
        <button class="pill" data-category="inmarket">In Market</button>
        <button class="pill" data-category="radar">On Our Radar</button>
      </div>
      <div class="filter-row" id="status-pills">
        <button class="pill active" data-status="all">All</button>
        <button class="pill" data-status="Tracking">Tracking</button>
        <button class="pill" data-status="Passed">Passed</button>
        <button class="pill" data-status="Active Diligence - Do Not Share">In Diligence</button>
      </div>
      <div class="filter-row" id="sector-pills">
        <button class="pill active" data-sector="all">All</button>
      </div>
      <div class="filter-row" id="date-pills">
        <button class="pill active" data-days="0">All time</button>
        <button class="pill" data-days="7">Last week</button>
        <button class="pill" data-days="14">Last 2 weeks</button>
        <button class="pill" data-days="21">Last 3 weeks</button>
        <button class="pill" data-days="30">Last month</button>
      </div>
      <div class="filter-row" id="sort-pills">
        <button class="pill active" data-sort="newest">Newest First</button>
        <button class="pill" data-sort="oldest">Oldest First</button>
        <button class="pill" data-sort="alpha">A → Z</button>
      </div>
      <input type="search" id="deal-search" placeholder="Search companies…" aria-label="Search deals">
    </div>
    <div id="deal-list" role="list" aria-label="Deal list"></div>
  </div>
</div>

<!-- Export Modal -->
<div id="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <div id="modal">
    <div id="modal-header">
      <span id="modal-title">Export Deals</span>
      <button id="modal-close" aria-label="Close modal">×</button>
    </div>
    <div id="deal-picker">
      <div class="picker-section">
        <div class="picker-section-header">
          <span class="picker-section-label">In Market</span>
          <button class="check-all-btn" onclick="togglePickerGroup('inmarket')">Toggle all</button>
        </div>
        <div id="picker-inmarket"></div>
      </div>
      <div class="picker-section">
        <div class="picker-section-header">
          <span class="picker-section-label">Tracking</span>
          <button class="check-all-btn" onclick="togglePickerGroup('tracking')">Toggle all</button>
        </div>
        <div id="picker-tracking"></div>
      </div>
      <div class="picker-section">
        <div class="picker-section-header">
          <span class="picker-section-label">Passed</span>
          <button class="check-all-btn" onclick="togglePickerGroup('passed')">Toggle all</button>
        </div>
        <div id="picker-passed"></div>
      </div>
      <div class="picker-section">
        <div class="picker-section-header">
          <span class="picker-section-label">In Diligence</span>
          <button class="check-all-btn" onclick="togglePickerGroup('diligence')">Toggle all</button>
        </div>
        <div id="picker-diligence"></div>
      </div>
    </div>
    <div class="tab-bar">
      <button class="tab-btn active" data-tab="text">Text</button>
      <button class="tab-btn" data-tab="email">Email</button>
    </div>
    <div class="tab-content active" id="tab-text">
      <textarea id="text-output" readonly></textarea>
    </div>
    <div class="tab-content" id="tab-email">
      <label style="font-size:12px;color:#6b7280;margin-bottom:2px">Subject</label>
      <input type="text" id="email-subject">
      <label style="font-size:12px;color:#6b7280;margin-bottom:2px">Body</label>
      <textarea id="email-body"></textarea>
    </div>
    <div id="modal-footer">
      <span class="copied-flash" id="copied-flash">Copied!</span>
      <button class="modal-btn" id="copy-btn">Copy to Clipboard</button>
      <button class="modal-btn primary" id="modal-close-btn">Done</button>
    </div>
  </div>
</div>

<script>
// -----------------------------------------------------------------------
// Data (injected by fetch_data.py)
// -----------------------------------------------------------------------
const DEALS = __DEALS_JSON__;
const FUNDS = __FUNDS_JSON__;
const GENERATED_AT = "__GENERATED_AT__";
const AIRTABLE_PAT = "__AIRTABLE_PAT__";
const AIRTABLE_BASE = "__AIRTABLE_BASE__";
const AIRTABLE_TABLE = "__AIRTABLE_TABLE__";

// -----------------------------------------------------------------------
// Stage matching
// -----------------------------------------------------------------------
const STAGE_MAP = {
  "Seed":     ["Pre-Seed", "Seed"],
  "Series A": ["Series A"],
  "Series B": ["Series B"],
  "Series C": ["Series C+"],
  "Growth":   ["Series C+"],
  "TBD":      null,
};

function dealMatchesFund(dealRaisingStage, fundPreferredStages) {
  if (!fundPreferredStages || fundPreferredStages.length === 0) return true;
  const affinityStages = STAGE_MAP[dealRaisingStage];
  if (affinityStages === null) return true;
  if (!affinityStages) return false;
  return affinityStages.some(s => fundPreferredStages.includes(s));
}

// -----------------------------------------------------------------------
// State
// -----------------------------------------------------------------------
let selectedFund = null;
let activePriority = "all";
let activeStages = new Set();   // empty = all stages
let activeCategory = "all"; // single-select: all | inmarket | radar
let activeStatus   = "all"; // single-select: all | Tracking | Passed | Active Diligence - Do Not Share
let activeSector   = "all"; // single-select: all | <business_type value>
let activeDays = 0;
let activeSort = "newest"; // newest | oldest | alpha
let fundSearchQ = "";
let dealSearchQ = "";

// Per-fund In Diligence share toggles: { fundName: Set<dealId> }
const shareableByFund = {};

function isDiligenceShareable(dealId) {
  if (!selectedFund) return false;
  const key = selectedFund.name;
  return shareableByFund[key] && shareableByFund[key].has(dealId);
}

function toggleDiligenceShare(dealId, checked) {
  if (!selectedFund) return;
  const key = selectedFund.name;
  if (!shareableByFund[key]) shareableByFund[key] = new Set();
  if (checked) shareableByFund[key].add(dealId);
  else shareableByFund[key].delete(dealId);
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------
function daysAgo(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    const now = new Date(GENERATED_AT);
    return Math.floor((now - d) / 86400000);
  } catch { return null; }
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return dateStr; }
}

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function priorityBadgeClass(p) {
  if (!p) return "badge-nopriority";
  const lp = p.toLowerCase();
  if (lp.includes("high")) return "badge-high";
  if (lp.includes("medium")) return "badge-medium";
  if (lp.includes("low")) return "badge-low";
  return "badge-nopriority";
}

function statusBadgeClass(s) {
  if (!s) return "";
  const ls = s.toLowerCase();
  if (ls.includes("active diligence")) return "badge-diligence";
  if (ls === "tracking") return "badge-tracking";
  if (ls === "passed") return "badge-passed";
  return "badge-tracking";
}

function categoryBadgeHtml(category) {
  if (!category) return "";
  const isInMarket = category.toLowerCase() === "in market";
  const cls = isInMarket ? "cat-inmarket" : "cat-radar";
  return `<span class="cat-badge ${cls}">${esc(category)}</span>`;
}

function truncate(str, n) {
  if (!str) return "";
  return str.length > n ? str.slice(0, n) + "…" : str;
}

// -----------------------------------------------------------------------
// Staleness check
// -----------------------------------------------------------------------
function initStaleCheck() {
  const genDate = new Date(GENERATED_AT);
  const now = new Date();
  const diffDays = (now - genDate) / 86400000;
  document.getElementById("generated-label").textContent =
    "Data as of " + formatDate(GENERATED_AT);
  if (diffDays > 3) {
    const banner = document.getElementById("stale-banner");
    banner.style.display = "block";
    document.getElementById("stale-date").textContent = formatDate(GENERATED_AT);
  }
}

// -----------------------------------------------------------------------
// Fund rendering
// -----------------------------------------------------------------------
function getVisibleFunds() {
  return FUNDS.filter(f => {
    if (activePriority !== "all" && f.priority !== activePriority) return false;
    if (fundSearchQ) {
      const q = fundSearchQ.toLowerCase();
      if (!f.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function renderFunds() {
  const funds = getVisibleFunds();
  document.getElementById("fund-count").textContent = funds.length;
  const list = document.getElementById("fund-list");
  if (funds.length === 0) {
    list.innerHTML = '<div class="no-results">No funds match filters</div>';
    return;
  }
  list.innerHTML = funds.map((f, i) => {
    const isSelected = selectedFund && selectedFund.name === f.name;
    const badgeClass = priorityBadgeClass(f.priority);
    const catTags = (f.fund_categorization || []).map(c =>
      `<span class="tag cat">${esc(c)}</span>`).join("");
    const stageTags = f.preferred_stages && f.preferred_stages.length
      ? f.preferred_stages.map(s => `<span class="tag">${esc(s)}</span>`).join("")
      : '<span class="tag" style="color:#9ca3af">Any stage</span>';
    const days = daysAgo(f.last_contact_date);
    const lcText = days === null ? "Never" : days === 0 ? "Today" : `${days}d ago`;
    return `<div class="fund-card${isSelected ? " selected" : ""}"
                 tabindex="0" role="listitem"
                 data-fund-idx="${i}"
                 onclick="selectFund(${i})"
                 onkeydown="if(event.key==='Enter'||event.key===' '){selectFund(${i});}">
      <div class="fund-card-name">${esc(f.name)}</div>
      <div class="fund-card-meta">
        <span class="badge ${badgeClass}">${esc(f.priority || "No Priority")}</span>
        ${catTags}
        <span style="margin-left:auto">Last contact: ${lcText}</span>
      </div>
      <div class="fund-card-stages">${stageTags}</div>
    </div>`;
  }).join("");
}

function selectFund(idx) {
  const funds = getVisibleFunds();
  const fund = funds[idx];
  if (selectedFund && selectedFund.name === fund.name) {
    clearFund();
    return;
  }
  selectedFund = fund;
  renderFunds();
  updateDealHeader();
  renderDeals();
}

function clearFund() {
  selectedFund = null;
  renderFunds();
  updateDealHeader();
  renderDeals();
}

// -----------------------------------------------------------------------
// Deal rendering
// -----------------------------------------------------------------------
function getVisibleDeals() {
  return DEALS.filter(d => {
    // Fund filter
    if (selectedFund) {
      if (!dealMatchesFund(d.raising_stage, selectedFund.preferred_stages)) return false;
    }
    // Stage filter (multi-select — empty set = all)
    if (activeStages.size > 0 && !activeStages.has(d.raising_stage)) return false;
    // Filter row 1: category (In Market vs On Our Radar)
    const cat = (d.category || "on our radar").toLowerCase();
    const isInMarketDeal = cat === "in market";
    if (activeCategory === "inmarket" && !isInMarketDeal) return false;
    if (activeCategory === "radar"    &&  isInMarketDeal) return false;
    // Filter row 2: sub-status (all | Active | Tracking | Passed | In Diligence)
    if (activeStatus !== "all") {
      if (activeStatus === "Active Diligence - Do Not Share") {
        if ((d.status || "").toLowerCase() !== "active diligence - do not share") return false;
      } else {
        if (d.status !== activeStatus) return false;
      }
    }
    // Sector filter
    if (activeSector !== "all") {
      if (!(d.business_type || []).includes(activeSector)) return false;
    }
    // Date filter
    if (activeDays > 0 && d.date_added) {
      const added = new Date(d.date_added);
      const cutoff = new Date(GENERATED_AT);
      cutoff.setDate(cutoff.getDate() - activeDays);
      if (added < cutoff) return false;
    }
    // Search
    if (dealSearchQ) {
      const q = dealSearchQ.toLowerCase();
      const haystack = [d.company_name, d.description, d.location,
        ...(d.business_type || [])].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (activeSort === "oldest") return (a.date_added || "").localeCompare(b.date_added || "");
    if (activeSort === "alpha")  return (a.company_name || "").localeCompare(b.company_name || "");
    return (b.date_added || "").localeCompare(a.date_added || ""); // newest (default)
  });
}

// For exports: same as getVisibleDeals but In Diligence deals must be explicitly checked per fund
function getExportableDeals() {
  return getVisibleDeals().filter(d => {
    if ((d.status || "").toLowerCase().includes("active diligence")) {
      return isDiligenceShareable(d.id);
    }
    return true;
  });
}

function updateDealHeader() {
  const titleEl = document.getElementById("deal-title");
  const clearBtn = document.getElementById("clear-fund-btn");
  const exportBtn = document.getElementById("export-btn");

  if (selectedFund) {
    titleEl.textContent = selectedFund.name;
    clearBtn.style.display = "inline-block";
    exportBtn.textContent = `Export for ${selectedFund.name}`;
  } else {
    titleEl.textContent = "All Deals (last 45 days)";
    clearBtn.style.display = "none";
    exportBtn.textContent = "Export All";
  }
}

function renderDeals() {
  const deals = getVisibleDeals();
  document.getElementById("deal-count").textContent =
    `${deals.length} deal${deals.length !== 1 ? "s" : ""}`;
  const list = document.getElementById("deal-list");
  if (deals.length === 0) {
    list.innerHTML = '<div class="no-results">No deals match current filters</div>';
    return;
  }
  list.innerHTML = deals.map((d, i) => {
    const statusClass = statusBadgeClass(d.status);
    // Show only the current fundraise stage (raising_stage), not "last completed → raising"
    const stageLine = d.raising_stage || d.stage || "";
    const btTags = (d.business_type || []).map(t =>
      `<span class="tag">${esc(t)}</span>`).join("");
    const descFull = d.description || "";
    const descShort = truncate(descFull, 120);
    const isLong = descFull.length > 120;
    const metricsHtml = d.metrics
      ? `<div class="deal-card-metrics">${esc(d.metrics)}</div>` : "";
    const fundingMeta = [
      d.founded      ? `Founded ${esc(d.founded)}`            : "",
      d.total_raised ? `Total Raised ${esc(d.total_raised)}`  : "",
      d.raise_amount ? `Raising ${esc(d.raise_amount)}`        : "",
    ].filter(Boolean).join(" · ");
    const fundingMetaHtml = fundingMeta
      ? `<div class="deal-card-funding-meta">${fundingMeta}</div>` : "";
    const allStatuses = ["Tracking", "Passed", "Active Diligence - Do Not Share"];
    const statusOpts = allStatuses.map(s =>
      `<option value="${s}"${d.status === s ? " selected" : ""}>${s === "Active Diligence - Do Not Share" ? "In Diligence" : s}</option>`).join("");
    const isDiligence = (d.status || "").toLowerCase().includes("active diligence");
    const shareChecked = isDiligenceShareable(d.id) ? "checked" : "";
    const shareToggle = isDiligence && selectedFund
      ? `<label class="diligence-share-label"><input type="checkbox" ${shareChecked} onchange="toggleDiligenceShare('${esc(d.id)}', this.checked)"> Include in export</label>`
      : "";
    return `<div class="deal-card" role="listitem" data-id="${esc(d.id)}">
      <div class="deal-card-header">
        <span class="deal-card-name">${esc(d.company_name)}</span>
        <div class="deal-card-actions" style="display:flex;align-items:center;gap:6px">
          ${categoryBadgeHtml(d.category)}
          <select class="status-select ${statusClass}" onchange="updateDealStatus('${esc(d.id)}', this)" title="Change status">
            ${statusOpts}
          </select>
        </div>
      </div>
      ${stageLine ? `<div class="deal-card-stage">${esc(stageLine)}</div>` : ""}
      <div class="deal-card-tags">${btTags}</div>
      ${d.location ? `<div class="deal-card-location">📍 ${esc(d.location)}</div>` : ""}
      ${fundingMetaHtml}
      <div class="deal-card-desc" onclick="toggleDesc(this, ${i})" data-full="${esc(descFull)}" data-short="${esc(descShort)}" data-expanded="false">
        ${esc(descShort)}${isLong ? ' <span style="color:#142B11;font-size:12px">more</span>' : ""}
      </div>
      ${metricsHtml}
      ${shareToggle}
      <div class="deal-card-footer">Added ${formatDate(d.date_added)}${d.logged_by ? " · " + esc(d.logged_by) : ""}</div>
    </div>`;
  }).join("");
}

function toggleDesc(el, idx) {
  const expanded = el.dataset.expanded === "true";
  if (expanded) {
    el.innerHTML = esc(el.dataset.short) + (el.dataset.full.length > 120
      ? ' <span style="color:#142B11;font-size:12px">more</span>' : "");
    el.dataset.expanded = "false";
  } else {
    el.innerHTML = esc(el.dataset.full) + ' <span style="color:#142B11;font-size:12px">less</span>';
    el.dataset.expanded = "true";
  }
}

// -----------------------------------------------------------------------
// Inline deal edit → Airtable PATCH
// -----------------------------------------------------------------------
const STATUS_FIELD = "fldTwzM2bVwlmnZz5";

async function updateDealStatus(recordId, selectEl) {
  const newStatus = selectEl.value;
  // Update local data immediately
  const deal = DEALS.find(d => d.id === recordId);
  if (deal) deal.status = newStatus;
  // Update select styling
  selectEl.className = "status-select " + statusBadgeClass(newStatus);
  selectEl.disabled = true;
  try {
    const resp = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${recordId}`,
      {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${AIRTABLE_PAT}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: { [STATUS_FIELD]: newStatus } }),
      }
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      console.error("Airtable update failed:", err);
      showToast("Save failed — check console", true);
    } else {
      showToast(`${deal ? deal.company_name : "Deal"} → ${newStatus}`);
    }
  } catch (e) {
    console.error("Airtable update error:", e);
    showToast("Save failed — no network?", true);
  }
  selectEl.disabled = false;
}

function showToast(msg, isError) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.style.cssText = "position:fixed;bottom:24px;right:24px;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:999;opacity:0;transition:opacity 0.2s;pointer-events:none;";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = isError ? "#fee2e2" : "#d1fae5";
  toast.style.color = isError ? "#991b1b" : "#065f46";
  toast.style.opacity = "1";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = "0"; }, 2500);
}

// -----------------------------------------------------------------------
// Pill filters
// -----------------------------------------------------------------------
function initPills() {
  document.getElementById("priority-pills").addEventListener("click", e => {
    const btn = e.target.closest(".pill");
    if (!btn) return;
    activePriority = btn.dataset.priority;
    document.querySelectorAll("#priority-pills .pill").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    // If selected fund is now hidden, clear it
    if (selectedFund) {
      const stillVisible = getVisibleFunds().some(f => f.name === selectedFund.name);
      if (!stillVisible) clearFund();
    }
    renderFunds();
    renderDeals();
  });

  document.getElementById("stage-pills").addEventListener("click", e => {
    const btn = e.target.closest(".pill");
    if (!btn) return;
    const val = btn.dataset.stage;
    if (val === "all") {
      activeStages.clear();
    } else {
      activeStages.has(val) ? activeStages.delete(val) : activeStages.add(val);
    }
    document.querySelectorAll("#stage-pills .pill").forEach(p => {
      if (p.dataset.stage === "all") p.classList.toggle("active", activeStages.size === 0);
      else p.classList.toggle("active", activeStages.has(p.dataset.stage));
    });
    renderDeals();
  });

  // Populate sector pills dynamically from deal data
  (() => {
    const sectors = new Set();
    DEALS.forEach(d => (d.business_type || []).forEach(t => { if (t) sectors.add(t); }));
    const container = document.getElementById("sector-pills");
    [...sectors].sort().forEach(s => {
      const btn = document.createElement("button");
      btn.className = "pill";
      btn.dataset.sector = s;
      btn.textContent = s;
      container.appendChild(btn);
    });
  })();

  document.getElementById("sector-pills").addEventListener("click", e => {
    const btn = e.target.closest(".pill");
    if (!btn) return;
    activeSector = btn.dataset.sector;
    document.querySelectorAll("#sector-pills .pill").forEach(p => {
      p.classList.toggle("active", p.dataset.sector === activeSector);
    });
    renderDeals();
  });

  document.getElementById("category-pills").addEventListener("click", e => {
    const btn = e.target.closest(".pill");
    if (!btn) return;
    activeCategory = btn.dataset.category;
    document.querySelectorAll("#category-pills .pill").forEach(p => {
      p.classList.toggle("active", p.dataset.category === activeCategory);
    });
    renderDeals();
  });

  document.getElementById("status-pills").addEventListener("click", e => {
    const btn = e.target.closest(".pill");
    if (!btn) return;
    activeStatus = btn.dataset.status;
    document.querySelectorAll("#status-pills .pill").forEach(p => {
      p.classList.toggle("active", p.dataset.status === activeStatus);
    });
    renderDeals();
  });
}

// -----------------------------------------------------------------------
// Search inputs
// -----------------------------------------------------------------------
function initSearch() {
  document.getElementById("fund-search").addEventListener("input", e => {
    fundSearchQ = e.target.value.trim();
    renderFunds();
    renderDeals();
  });
  document.getElementById("date-pills").addEventListener("click", e => {
    const btn = e.target.closest(".pill");
    if (!btn) return;
    activeDays = parseInt(btn.dataset.days, 10);
    document.querySelectorAll("#date-pills .pill").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    renderDeals();
  });

  document.getElementById("sort-pills").addEventListener("click", e => {
    const btn = e.target.closest(".pill");
    if (!btn) return;
    activeSort = btn.dataset.sort;
    document.querySelectorAll("#sort-pills .pill").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    renderDeals();
  });

  document.getElementById("deal-search").addEventListener("input", e => {
    dealSearchQ = e.target.value.trim();
    renderDeals();
  });
}

// -----------------------------------------------------------------------
// Export modal — deal picker
// -----------------------------------------------------------------------
let exportSelectedIds = new Set();

function populatePicker() {
  const deals = getExportableDeals();
  const inMarket   = deals.filter(d => (d.category || "").toLowerCase() === "in market");
  const tracking   = deals.filter(d => (d.category || "").toLowerCase() !== "in market" && (d.status || "").toLowerCase() === "tracking");
  const passed     = deals.filter(d => (d.status || "").toLowerCase() === "passed");
  const diligence  = deals.filter(d => (d.status || "").toLowerCase().includes("active diligence"));

  // In Market checked by default; everything else unchecked
  exportSelectedIds = new Set(inMarket.map(d => d.id));

  renderPickerSection("picker-inmarket",  inMarket);
  renderPickerSection("picker-tracking",  tracking);
  renderPickerSection("picker-passed",    passed);
  renderPickerSection("picker-diligence", diligence);
  updateExportOutput();
}

function renderPickerSection(containerId, deals) {
  const el = document.getElementById(containerId);
  if (!deals.length) {
    el.innerHTML = '<div class="picker-empty">None</div>';
    return;
  }
  el.innerHTML = deals.map(d => {
    const checked = exportSelectedIds.has(d.id) ? "checked" : "";
    return `<div class="picker-deal">
      <input type="checkbox" ${checked} data-id="${esc(d.id)}" onchange="togglePickerDeal('${esc(d.id)}',this.checked)">
      <span class="picker-deal-name">${esc(d.company_name)}</span>
      <span class="picker-deal-stage">— ${esc(d.raising_stage || "TBD")}</span>
    </div>`;
  }).join("");
}

function togglePickerDeal(dealId, checked) {
  checked ? exportSelectedIds.add(dealId) : exportSelectedIds.delete(dealId);
  updateExportOutput();
}

function togglePickerGroup(group) {
  const deals = getExportableDeals();
  const groupMap = {
    inmarket:  { filter: d => (d.category || "").toLowerCase() === "in market",                                                                    containerId: "picker-inmarket"  },
    tracking:  { filter: d => (d.category || "").toLowerCase() !== "in market" && (d.status || "").toLowerCase() === "tracking", containerId: "picker-tracking"  },
    passed:    { filter: d => (d.status || "").toLowerCase() === "passed",                             containerId: "picker-passed"    },
    diligence: { filter: d => (d.status || "").toLowerCase().includes("active diligence"),             containerId: "picker-diligence" },
  };
  const { filter, containerId } = groupMap[group] || {};
  if (!filter) return;
  const groupDeals = deals.filter(filter);
  const allChecked = groupDeals.every(d => exportSelectedIds.has(d.id));
  groupDeals.forEach(d => allChecked ? exportSelectedIds.delete(d.id) : exportSelectedIds.add(d.id));
  renderPickerSection(containerId, groupDeals);
  updateExportOutput();
}

function updateExportOutput() {
  const selected = DEALS.filter(d => exportSelectedIds.has(d.id));
  document.getElementById("text-output").value   = buildTextFromDeals(selected);
  document.getElementById("email-body").value    = buildEmailFromDeals(selected);
}

// Strip internal sourcing notes and relationship management language from descriptions.
function cleanDesc(text) {
  if (!text) return text;
  // Remove sentences containing internal relationship or sourcing references
  const sentencePattern = /[^.!?\n]*\b(flagged by|sourced by|source:|introduced by|referred by|noted by|via [A-Z]|[A-Z]{1,3} to reach out|[A-Z]{1,3} to follow up|[A-Z]{1,3} to connect|[A-Z]{1,3} to intro|[A-Z]{1,3} to send|[A-Z]{1,3} to schedule|[A-Z]{1,3} to set up|[A-Z]{1,3} to ping|reach out to them|follow up with|will reach out|will follow up|planning to reach|Innovius to|will intro|making intro|making an intro)[^.!?\n]*[.!?]?/gi;
  return text.replace(sentencePattern, "").replace(/\s{2,}/g, " ").trim();
}

function buildTextFromDeals(deals) {
  if (!deals.length) return "No deals selected.";
  return deals.map(d => {
    const lines = [`${d.company_name} — ${d.raising_stage || "TBD"} raise`];
    const desc = cleanDesc(d.description);
    if (desc) lines.push(desc);
    if (d.metrics) lines.push(`KPIs: ${d.metrics}`);
    return lines.join("\n");
  }).join("\n\n");
}

function buildEmailFromDeals(deals) {
  const fund = selectedFund;
  const contactFirst = (fund && fund.innovius_contacts && fund.innovius_contacts[0])
    ? fund.innovius_contacts[0].firstName || "there" : "there";
  const fundName = fund ? fund.name : "your fund";
  const body = deals.length
    ? deals.map(d => {
        const lines = [`**${d.company_name}** — ${d.raising_stage || "TBD"} raise`];
        const desc = cleanDesc(d.description);
        if (desc) lines.push(desc);
        if (d.metrics) lines.push(`KPIs: ${d.metrics}`);
        return lines.join("\n");
      }).join("\n\n")
    : "No deals selected.";
  return `Hi ${contactFirst},\n\nSharing a few companies we\'re tracking that match ${fundName}\'s focus.\n\n${body}\n\nHappy to make introductions to any of these. Let me know which ones are interesting.\n\nBest,\n[Sender]`;
}

function openExportModal() {
  const fund = selectedFund;
  document.getElementById("modal-title").textContent = fund ? `Export for ${fund.name}` : "Export All Deals";
  document.getElementById("email-subject").value = fund ? `Deal Flow Update — ${fund.name}` : "Deal Flow Update — Innovius Capital";
  populatePicker();
  document.getElementById("modal-overlay").classList.add("open");
}


function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
}

function activateTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tabId));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === "tab-" + tabId));
}

function copyModal() {
  const activeTab = document.querySelector(".tab-btn.active").dataset.tab;
  let text;
  if (activeTab === "text") {
    text = document.getElementById("text-output").value;
  } else {
    const subj = document.getElementById("email-subject").value;
    const body = document.getElementById("email-body").value;
    text = `Subject: ${subj}\n\n${body}`;
  }
  navigator.clipboard.writeText(text).then(() => {
    const flash = document.getElementById("copied-flash");
    flash.style.display = "inline";
    setTimeout(() => { flash.style.display = "none"; }, 2000);
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  });
}

function initModal() {
  document.getElementById("export-btn").addEventListener("click", openExportModal);
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-close-btn").addEventListener("click", closeModal);
  document.getElementById("copy-btn").addEventListener("click", copyModal);
  document.getElementById("clear-fund-btn").addEventListener("click", clearFund);

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });

  document.getElementById("modal-overlay").addEventListener("click", e => {
    if (e.target === document.getElementById("modal-overlay")) closeModal();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeModal();
  });
}

// -----------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  initStaleCheck();
  initPills();
  initSearch();
  initModal();
  renderFunds();
  renderDeals();
});
</script>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# HTML generation
# ---------------------------------------------------------------------------

def generate_html(deals, funds, generated_at, airtable_pat, airtable_base, airtable_table):
    deals_json = json.dumps(deals, ensure_ascii=False)
    funds_json = json.dumps(funds, ensure_ascii=False)

    html = HTML_TEMPLATE
    html = html.replace("__DEALS_JSON__", deals_json)
    html = html.replace("__FUNDS_JSON__", funds_json)
    html = html.replace("__GENERATED_AT__", generated_at)
    html = html.replace("__AIRTABLE_PAT__", airtable_pat)
    html = html.replace("__AIRTABLE_BASE__", airtable_base)
    html = html.replace("__AIRTABLE_TABLE__", airtable_table)
    return html


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

CACHE_MAX_AGE_DAYS = 7


def load_affinity_cache(cache_path):
    """Return (funds list, cache_age_days) if cache exists and is fresh, else (None, None)."""
    if not os.path.exists(cache_path):
        return None, None
    try:
        with open(cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        saved_at = datetime.fromisoformat(data["saved_at"])
        age_days = (datetime.now(timezone.utc) - saved_at).total_seconds() / 86400
        if age_days > CACHE_MAX_AGE_DAYS:
            return None, age_days
        return data["funds"], age_days
    except Exception as e:
        print(f"  Cache read error ({e}), will re-fetch.")
        return None, None


def save_affinity_cache(cache_path, funds):
    """Save funds list to cache with current timestamp."""
    data = {
        "saved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00"),
        "funds": funds,
    }
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(script_dir, ".env")
    output_path = os.path.join(script_dir, "dealflow.html")
    cache_path = os.path.join(script_dir, "affinity_cache.json")

    refresh_funds = "--refresh-funds" in sys.argv

    # --airtable-json <path> or --airtable-json=<path>
    # When set, skip the Airtable API call and load records from a local file.
    # Used by Cowork scheduled tasks whose sandbox blocks outbound HTTPS.
    airtable_json_path = None
    for i, arg in enumerate(sys.argv[1:]):
        if arg.startswith("--airtable-json="):
            airtable_json_path = arg.split("=", 1)[1]
        elif arg == "--airtable-json" and (i + 2) < len(sys.argv):
            airtable_json_path = sys.argv[i + 2]

    print("Innovius Capital Deal Flow Platform")
    print("=" * 40)

    env = load_env(env_path)
    airtable_pat = env.get("AIRTABLE_PAT", "")
    airtable_base = env.get("AIRTABLE_BASE_ID", "appx2A1CywraYN0G8")
    airtable_table = env.get("AIRTABLE_TABLE_ID", "tblHYeClTmtU9V4T4")
    affinity_key = env.get("AFFINITY_API_KEY", "")
    affinity_list = env.get("AFFINITY_VC_LIST_ID", "117968")

    if not airtable_pat and not airtable_json_path:
        print("ERROR: AIRTABLE_PAT not set in .env")
        sys.exit(1)
    if not affinity_key and not os.path.exists(cache_path):
        print("WARNING: AFFINITY_API_KEY not set and no cache found -- funds list will be empty")

    # Fetch Airtable -- use pre-fetched file if provided, otherwise call API
    if airtable_json_path:
        print("Loading pre-fetched Airtable data (Cowork mode)...")
        raw_records = load_airtable_json(airtable_json_path)
        # Strip PAT from static output -- live refresh requires direct API access
        airtable_pat = ""
    else:
        raw_records = fetch_airtable(airtable_pat, airtable_base, airtable_table)

    # Write-back: patch stale taxonomy tags in Airtable (skip in Cowork/offline mode)
    if not airtable_json_path and airtable_pat:
        print("Checking taxonomy...")
        normalize_airtable_taxonomy(airtable_pat, airtable_base, airtable_table, raw_records)

    deals = parse_airtable_records(raw_records)

    # Affinity: use cache if available and not forced refresh
    funds = None
    if not refresh_funds:
        funds, age_days = load_affinity_cache(cache_path)
        if funds is not None:
            print(f"Using cached Affinity fund list ({age_days:.1f} days old). Run with --refresh-funds to update.")
        elif age_days is not None:
            print(f"Affinity cache is {age_days:.1f} days old (>{CACHE_MAX_AGE_DAYS}d) -- re-fetching...")

    if funds is None:
        if not affinity_key:
            print("WARNING: AFFINITY_API_KEY not set -- skipping fund fetch, using empty list")
            funds = []
        else:
            raw_entries = fetch_affinity(affinity_key, affinity_list)
            funds = parse_affinity_entries(raw_entries)
            save_affinity_cache(cache_path, funds)
            print(f"  Affinity cache saved to affinity_cache.json")

    # Generate HTML
    generated_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    html = generate_html(deals, funds, generated_at, airtable_pat, airtable_base, airtable_table)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    print()
    print(f"Done!")
    print(f"  Deals: {len(deals)}")
    print(f"  Funds: {len(funds)}")
    print(f"  Output: {output_path}")


if __name__ == "__main__":
    main()
