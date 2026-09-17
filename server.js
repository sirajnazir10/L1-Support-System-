// L1 Support for MR & CP — local server
// Serves the web app and a small JSON API for the knowledge base, tickets,
// and the continuous-learning log. Everything persists to /data so the app
// keeps its state across restarts.

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const KB_FILE = path.join(DATA_DIR, 'kb.json');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
const LOG_FILE = path.join(DATA_DIR, 'learning-log.json');

app.use(express.json({ limit: '15mb' })); // generous limit so attached screenshots (base64) fit
app.use(express.static(path.join(__dirname, 'public')));

// ---------------- small JSON-file helpers ----------------
function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8').trim();
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.error('Failed to read', file, err.message);
    return fallback;
  }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
function ensureFile(file, fallback) {
  if (!fs.existsSync(file)) writeJson(file, fallback);
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
ensureFile(KB_FILE, []);
ensureFile(TICKETS_FILE, []);
ensureFile(LOG_FILE, []);

// ---------------- Knowledge base ----------------
// GET all entries
app.get('/api/kb', (req, res) => {
  res.json(readJson(KB_FILE, []));
});

// Add a new entry — this is how the KB grows: an agent, or a future
// integration (tickets/website/docs pipeline), posts a new sourced entry here.
app.post('/api/kb', (req, res) => {
  const { title, sourceDoc, page, keywords, answer } = req.body || {};
  if (!title || !sourceDoc || !answer) {
    return res.status(400).json({ error: 'title, sourceDoc, and answer are required.' });
  }
  const kb = readJson(KB_FILE, []);
  const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
  const entry = {
    id: 'custom-' + slug + '-' + Date.now().toString(36),
    title: String(title),
    sourceDoc: String(sourceDoc),
    page: Number(page) || 0,
    keywords: Array.isArray(keywords) ? keywords : String(keywords || '').split(',').map(s => s.trim()).filter(Boolean),
    answer: String(answer)
  };
  kb.push(entry);
  writeJson(KB_FILE, kb);
  appendLog(`<b>Knowledge base updated</b> — new entry "${escapeHtmlLite(entry.title)}" added (source: ${escapeHtmlLite(entry.sourceDoc)}).`);
  res.status(201).json(entry);
});

// ---------------- Tickets ----------------
app.get('/api/tickets', (req, res) => {
  res.json(readJson(TICKETS_FILE, []));
});

app.post('/api/tickets', (req, res) => {
  const tickets = readJson(TICKETS_FILE, []);
  const ticket = Object.assign({ id: 'MR-' + (1000 + tickets.length + 1), createdAt: new Date().toISOString() }, req.body);
  tickets.push(ticket);
  writeJson(TICKETS_FILE, tickets);
  res.status(201).json(ticket);
});

app.patch('/api/tickets/:id', (req, res) => {
  const tickets = readJson(TICKETS_FILE, []);
  const idx = tickets.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Ticket not found.' });
  tickets[idx] = Object.assign({}, tickets[idx], req.body);
  writeJson(TICKETS_FILE, tickets);
  res.json(tickets[idx]);
});

// ---------------- Learning log ----------------
function escapeHtmlLite(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function appendLog(text) {
  const log = readJson(LOG_FILE, []);
  log.unshift({ text, ts: new Date().toISOString() });
  writeJson(LOG_FILE, log.slice(0, 500));
}

app.get('/api/log', (req, res) => {
  res.json(readJson(LOG_FILE, []));
});

app.post('/api/log', (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text is required.' });
  appendLog(String(text));
  res.status(201).json({ ok: true });
});

app.listen(PORT, () => {
  console.log('');
  console.log('  L1 Support for MR & CP is running.');
  console.log('  Open http://localhost:' + PORT + ' in your browser.');
  console.log('  Knowledge base: ' + readJson(KB_FILE, []).length + ' entries loaded from data/kb.json');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
