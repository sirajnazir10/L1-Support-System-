# MR Nexis — V1

**Version 1** of the document-grounded MR Nexis support app for Modern
Requirements4DevOps and
Copilot4DevOps. It runs entirely on your own machine — no cloud account,
no Zendesk connection required — and serves a website at
`http://localhost:3002` that both customers and support agents use.

- **Customer Portal** — an Outlook/Word-style chat composer (type text,
  drop in an image mid-sentence, keep typing) with drag-and-drop for
  screenshots, logs, and documents. Answers are retrieved and cited from
  the loaded documentation, not freely generated.
- **Agent Console** — a ticket queue, an AI Analysis panel (module,
  priority, confidence, known-issue flag), cited sources, a rich-text
  response editor, Approve & Send / Escalate actions with an
  auto-generated escalation summary, and a Learning Log.
- **Add documentation** panel in the console lets an agent add a new,
  verified answer to the knowledge base on the spot — it's saved to disk
  immediately and used in the very next query.

Everything (knowledge base, tickets, learning log) is stored as plain
JSON files in the `data/` folder next to this app, so it survives
restarts and is easy to back up, inspect, or edit by hand.

## Requirements

- [Node.js](https://nodejs.org) 16 or newer (the LTS installer is fine).
  Works on Windows, macOS, and Linux.

## Running it on Windows

1. Install Node.js from https://nodejs.org if you don't already have it
   (default install options are fine).
2. Double-click **`start.bat`** in this folder.
3. A console window opens, installs the one dependency the first time
   (a few seconds), and starts the server. Your browser opens
   automatically to `http://localhost:3002`.
4. To stop the app, close that console window (or press Ctrl+C in it).

## Running it on macOS / Linux

```
./start.sh
```

(If it's not executable yet: `chmod +x start.sh` once, then run it.)

## Running it manually (any OS)

```
npm install
npm start
```

Then open `http://localhost:3002` in a browser.

## Making it reachable from other machines on your network

By default the app listens on every network interface of the machine
it's running on, so colleagues on the same network can already reach it
at `http://<your-computer-name-or-IP>:3002` once it's started — just make
sure Windows Firewall allows inbound connections on port 3002. For a
proper org-wide deployment on a normal `http://` URL (no `:3002`, running
as a background service instead of a console window), see the IIS
section below.

## Deploying this on IIS for your organization (plain HTTP)

This app is a Node.js/Express server, and IIS does not run Node code
natively — so "putting it on IIS" means one of two things. **Option A**
(recommended) is more robust and easier to keep running long-term.
**Option B** keeps everything inside IIS itself, at the cost of relying
on the less actively maintained `iisnode` module.

Do this on the Windows Server (or PC acting as one) that already runs
IIS on your network — not on your own laptop, unless that's also where
IIS lives.

### Option A — IIS as a reverse proxy in front of Node (recommended)

The Node app runs continuously as a Windows Service on `127.0.0.1:3002`
(never exposed directly), and IIS listens on port 80 for your org and
silently forwards every request to it. This is the standard way to put
any Node/Express/Next/etc. app behind IIS.

**1. Install prerequisites on the server (one-time):**
- [Node.js LTS](https://nodejs.org) — same as before.
- **URL Rewrite** module for IIS — https://www.iis.net/downloads/microsoft/url-rewrite
- **Application Request Routing (ARR)** — https://www.iis.net/downloads/microsoft/application-request-routing
- [NSSM](https://nssm.cc/download) (a tiny, well-known tool for running any .exe as a Windows Service) — unzip it somewhere like `C:\nssm`.

**2. Copy the app to the server**, e.g. `C:\apps\MR-Nexis`
(the same folder you already have — copy it there, or re-download the
zip on the server), then from an elevated Command Prompt in that folder:
```
npm install --production
set HOST=127.0.0.1
set PORT=3002
```

**3. Register it as a Windows Service with NSSM** so it starts
automatically and keeps running without a console window open:
```
C:\nssm\nssm.exe install MRNexis "C:\Program Files\nodejs\node.exe" "C:\apps\MR-Nexis\server.js"
C:\nssm\nssm.exe set MRNexis AppDirectory "C:\apps\MR-Nexis"
C:\nssm\nssm.exe set MRNexis AppEnvironmentExtra "PORT=3002" "HOST=127.0.0.1"
C:\nssm\nssm.exe set MRNexis Start SERVICE_AUTO_START
C:\nssm\nssm.exe start MRNexis
```
Confirm it's up by browsing to `http://localhost:3002` **on the server
itself** — you should see the app.

**4. Turn on ARR's proxy feature:** open IIS Manager → click the
server name (top of the tree) → double-click **Application Request
Routing Cache** → in the Actions pane, click **Server Proxy Settings…**
→ check **Enable proxy** → Apply.

**5. Add a reverse-proxy rewrite rule:** select **Default Web Site**
(or whichever site should serve this app) → double-click **URL
Rewrite** → **Add Rule(s)…** → **Reverse Proxy** → enter
`localhost:3002` as the server to forward to → OK. This writes a rule
that sends every request on that site straight to the Node app.

**6. Open the firewall:** in Windows Defender Firewall, allow inbound
traffic on port 80 (usually already open if IIS is already serving
other sites).

**7. Test from another PC on the network:** `http://<server-name-or-IP>/`
should now load the app, on plain HTTP, no port number needed.

To update the app later: stop the service (`nssm stop MRNexis`),
replace the files, run `npm install --production` again if
`package.json` changed, then `nssm start MRNexis`.

### Option B — iisnode (Node runs inside IIS itself)

If you'd rather not run a separate Windows Service and want IIS to
manage the Node process directly:

1. Install the **iisnode** module: https://github.com/Azure/iisnode/releases
   (also requires the URL Rewrite module from Option A, step 1).
2. Copy the app to a folder IIS can serve, e.g. `C:\inetpub\wwwroot\MR-Nexis`.
3. Rename the included `web.config.iisnode-example` file (in this
   folder) to `web.config` — it already contains the handler and
   rewrite rules iisnode needs, pointing at `server.js`.
4. In IIS Manager, add a new website (or application under an existing
   one) whose physical path is that folder, bound to port 80 (or a
   different site/host header if port 80 is taken by another site).
5. Browse to the site's address — IIS + iisnode will start `server.js`
   automatically on first request.

Option A is generally preferred for anything beyond a quick trial,
since iisnode hasn't seen active development in some time and Option A
lets you manage/restart the Node process independently of IIS.

### Either option — a couple of things worth knowing

- **HTTPS**: both options can be extended to serve `https://` by adding
  a certificate binding in IIS the normal way (IIS terminates TLS; the
  Node app itself keeps speaking plain HTTP internally) — ask if you'd
  like the exact steps once you're ready for that.
- **Data location**: `data/kb.json`, `data/tickets.json`, and
  `data/learning-log.json` live next to `server.js` wherever you deploy
  it — back that folder up like you would any other application data.
- This is still the local keyword-matching demo described below, not a
  live model call or a Zendesk/website integration — IIS just changes
  *how it's reached* on your network, not what it does.

## Growing the knowledge base

Right now the app is grounded in 11 source documents (207 indexed
sections): the Installation Guide, Admin Configuration Guide,
Customization & Troubleshooting Guide, Word Import Configuration
Technote, Cross-Reference Technote, MR4DevOps Services Technote,
Document Properties Technote, Test Case Management Technote, 2025
Release Notes, 2025 Patch Release Notes, and the MR4TFS Embedded
overview.

Two ways to add more:

1. **From the Agent Console** — use the "Add documentation" panel to add
   a verified answer directly (great for capturing the resolution of a
   ticket that wasn't covered yet).
2. **By editing `data/kb.json` directly** — each entry looks like:

```json
{
  "id": "unique-id",
  "title": "Short descriptive title",
  "sourceDoc": "Name of the source document",
  "page": 12,
  "keywords": ["keyword one", "keyword two"],
  "answer": "The full answer, written in plain language."
}
```

Restart the server (or just refresh the page — the KB is fetched fresh
on every load) after editing the file by hand.

## What's in V1 (and isn't)

This is **Version 1**: the full customer/agent workflow running for
real on local keyword matching against the loaded documents — not yet a
live call to an AI model, and not yet connected to Zendesk, your
website, or live ticket history. It's built to prove out the exact
shape of the real pipeline (classify → retrieve → draft → prioritize →
route → escalate) so the UI, the review workflow, and the knowledge base
are already real and usable today.

**Likely V2+ candidates**, once this shape is approved:
- Swap the keyword matcher for a real model call (semantic search + a
  drafting model) for better recall on how customers actually phrase
  things.
- Connect to Zendesk and the website so tickets and content flow in
  automatically instead of manual "Add documentation" entries.
- User accounts/login for agents, instead of a single shared console.
- HTTPS and a proper database (instead of JSON files) once this moves
  off a single machine.

Each future version can keep living in this same repo — bump the
`version` in `package.json` and the `V1` label in the page header when
that work starts.
