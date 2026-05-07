# Innovius Outreach Automation

Reads your company tracker, classifies each company, generates tailored email campaigns in Marci's voice, and exports to Apollo CSV or sends via Gmail.

---

## Setup

### 1. Install dependencies

```bash
cd innovius-outreach
npm install
```

### 2. Create your .env file

```bash
cp .env.example .env
```

Fill in each value (see below for where to find them).

### 3. Get Google credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable **Gmail API** and **Google Sheets API**
3. Create OAuth 2.0 credentials (Desktop app)
4. Copy Client ID and Client Secret into `.env`
5. Run the auth helper to get your refresh token:

```bash
node auth.js
```

Paste the refresh token into `.env` as `GOOGLE_REFRESH_TOKEN`.

### 4. Get your Spreadsheet ID

Your Google Sheet URL looks like:
`https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit`

Copy that ID into `.env` as `SHEETS_SPREADSHEET_ID`.

Make sure your sheet has these columns (in order, starting at column A):

| A | B | C | D | E | F | G | H | I | J | K | L | M | N |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Domain | Company Name | City/State | Priority | Who Owns | Campaign Type | Last Emailed | Email Count | Status | Website | Description | Founder Name | Founder Email | Has Response |

**Has Response** = "yes" or "no" — whether you've ever gotten a reply.

### 5. Get Affinity API key

Go to Affinity → Settings → API → copy your API key into `.env` as `AFFINITY_API_KEY`.

### 6. Get Anthropic API key

Go to [console.anthropic.com](https://console.anthropic.com) → API Keys → create one → paste into `.env`.

---

## Usage

```bash
# Review all companies that need action (default, safe — nothing sends)
node index.js --output=review

# Generate for net new companies, export Apollo CSV
node index.js --type=net_new --output=apollo_csv

# Generate warm follow-ups, send via Gmail (will ask company by company)
node index.js --type=warm --output=gmail

# Single company review
node index.js --company=olli_health --output=review

# All companies, review before deciding output
node index.js --all --output=review
```

### Output modes

| Flag | What it does |
|------|-------------|
| `--output=review` | Prints campaigns to terminal. Nothing sends. You decide next. |
| `--output=apollo_csv` | Exports a CSV ready to import into Apollo as a sequence |
| `--output=gmail` | Sends Email 1 immediately, saves 2-N as threaded Gmail drafts |

### Campaign types

| Type | When | Emails |
|------|------|--------|
| `NET_NEW` | Never contacted | 6 |
| `WARM` | 1-3 emails sent, no reply | 4 |
| `CANNOT_BREAK_IN` | 4+ emails, no reply | 3 |
| `RE_ENGAGE` | Known in Affinity, 90+ days quiet | 4 |

---

## Affinity MCP Server (optional)

If you want to connect the Affinity integration directly as an MCP server for use in Claude Code:

```bash
node affinity-mcp-server.js
```

Add to your Claude Code MCP config (`~/.claude/mcp_servers.json`):

```json
{
  "affinity": {
    "command": "node",
    "args": ["/path/to/innovius-outreach/affinity-mcp-server.js"],
    "env": {
      "AFFINITY_API_KEY": "your_key_here"
    }
  }
}
```

Tools exposed: `get_company(domain)`, `get_interactions(company_id)`, `search_companies(query)`

---

## Files

```
innovius-outreach/
  index.js                  Main entry point + CLI
  classify.js               Campaign classification logic
  generate.js               Email generation via Claude API
  sheets.js                 Google Sheets read/write
  affinity.js               Affinity REST API wrapper
  affinity-mcp-server.js    Affinity wrapped as MCP server
  gmail.js                  Gmail send/draft logic
  apollo.js                 Apollo CSV export
  auth.js                   One-time Google OAuth helper
  prompts/
    net_new.txt             Prompt guidance for cold outreach
    warm.txt                Prompt guidance for warm follow-up
    cannot_break_in.txt     Prompt guidance for re-engagement
    re_engage.txt           Prompt guidance for relationship restart
  .env                      API keys (never commit this)
  .env.example              Template
```
