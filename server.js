// MR Nexis — local server
// Serves the web app and a small JSON API for the knowledge base, tickets,
// and the continuous-learning log. Everything persists to /data so the app
// keeps its state across restarts.

const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const KB_FILE = path.join(DATA_DIR, 'kb.json');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
const LOG_FILE = path.join(DATA_DIR, 'learning-log.json');

// ---------------- LLM (optional — app works without it, see /api/llm-status) ----------------
// Reads the key from the environment only; never hardcode or log it. Everything that calls
// this stays behind an `llmAvailable()` check so a missing/invalid key degrades to the
// existing local keyword-matching engine (client-side) instead of breaking the app.
const NEXIS_MODEL = process.env.NEXIS_MODEL || 'claude-sonnet-5';
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
function llmAvailable() { return !!anthropic; }

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

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

// ---------------- LLM-backed answering (optional) ----------------
// Client asks the local keyword engine to retrieve candidate entries first (unchanged —
// entity detection, typo tolerance, ambiguity handling all still happen there), then can send
// those candidates here for a more naturally-drafted answer. This never freelances beyond the
// given candidates and never fabricates a source; if the model doesn't have enough there, it
// says so, the same honesty rule the local engine already follows.
app.get('/api/llm-status', (req, res) => {
  res.json({ available: llmAvailable(), model: llmAvailable() ? NEXIS_MODEL : null });
});

const NEXIS_DRAFT_SYSTEM_PROMPT = `You are Nexis, a support assistant for Modern Requirements4DevOps and Copilot4DevOps.
Answer ONLY using the candidate source excerpts you are given — never use outside knowledge, never invent a fact, never cite a source not given to you.
If the excerpts don't actually answer the question, say so plainly instead of guessing — this matters more than sounding confident.
Write like a helpful, direct human support agent: plain language, contractions are fine, no corporate filler, no bullet-pointing every sentence.
Respond with ONLY a single JSON object, no other text, matching exactly:
{"understanding": "one short sentence naming what the question is about, or that it's unclear", "answer": "the actual answer, or an honest 'I don't have that' if the excerpts don't cover it", "nextStep": "one short natural follow-up sentence, or null if nothing further is needed", "usedIds": ["id-of-every-excerpt-actually-used"], "confident": true or false}`;

app.post('/api/ask', async (req, res) => {
  if (!llmAvailable()) return res.json({ available: false, reason: 'no-api-key' });
  const { question, candidates } = req.body || {};
  if (!question || !Array.isArray(candidates) || !candidates.length) {
    return res.status(400).json({ error: 'question and a non-empty candidates array are required.' });
  }
  try {
    const excerpts = candidates.slice(0, 8).map(c =>
      `[id: ${c.id}] (${c.sourceDoc}, "${c.title}")\n${c.answer}`
    ).join('\n\n---\n\n');
    const message = await anthropic.messages.create({
      model: NEXIS_MODEL,
      max_tokens: 700,
      system: NEXIS_DRAFT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Customer question: "${question}"\n\nCandidate excerpts:\n\n${excerpts}` }]
    });
    const raw = (message.content || []).map(b => b.type === 'text' ? b.text : '').join('').trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return res.json({ available: false, reason: 'unparseable-response' });
    }
    res.json({ available: true, ...parsed, model: NEXIS_MODEL });
  } catch (err) {
    console.error('LLM /api/ask failed:', err.message);
    res.json({ available: false, reason: 'llm-error' });
  }
});

// ---------------- Document upload -> KB entry extraction (optional, requires LLM) ----------------
// Uploaded files are never written to disk or added to the KB automatically — text is
// extracted, an LLM proposes candidate entries, and the caller reviews/edits/approves each one
// (saved individually through the existing POST /api/kb) before anything persists.
async function extractTextFromUpload(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.pdf') {
    const data = await pdfParse(file.buffer);
    return data.text;
  }
  if (ext === '.docx' || ext === '.doc') {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }
  if (ext === '.txt' || ext === '.md') {
    return file.buffer.toString('utf8');
  }
  return null; // unsupported type — caller checks for this
}

app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (expected multipart field "file").' });
  if (!llmAvailable()) {
    return res.status(503).json({ error: 'Document upload requires the LLM to extract entries, and no API key is configured (set ANTHROPIC_API_KEY on the server).' });
  }
  let text;
  try {
    text = await extractTextFromUpload(req.file);
  } catch (err) {
    return res.status(422).json({ error: 'Could not read this file: ' + err.message });
  }
  if (text === null) {
    return res.status(415).json({ error: 'Unsupported file type — upload a PDF, Word (.docx), .txt, or .md file.' });
  }
  text = text.trim();
  if (!text) {
    return res.status(422).json({ error: 'No extractable text found in this file.' });
  }

  const defaultSourceDoc = path.basename(req.file.originalname, path.extname(req.file.originalname));
  const EXTRACTION_SYSTEM_PROMPT = `You split a support/product document into distinct, self-contained knowledge-base entries.
Each entry must be a single clear question-and-answer unit a customer might plausibly ask about — don't split one coherent idea into fragments, and don't merge unrelated topics into one entry.
Only use facts actually present in the document — never add outside information.
Respond with ONLY a JSON array, no other text, of objects matching exactly:
{"title": "short descriptive title", "sourceDoc": "${defaultSourceDoc}", "page": 1, "keywords": ["3-8 short search phrases a customer would type"], "answer": "the full answer in plain language, grounded only in the document text"}
If the document is too short or unclear to split meaningfully, return a single entry covering it as a whole. Cap it at 40 entries.`;

  try {
    // Large documents are chunked so extraction stays within the model's context/output limits.
    const CHUNK_SIZE = 12000;
    const chunks = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE) chunks.push(text.slice(i, i + CHUNK_SIZE));

    const allEntries = [];
    for (const chunk of chunks.slice(0, 10)) { // hard cap: 10 chunks (~120k chars) per upload
      const message = await anthropic.messages.create({
        model: NEXIS_MODEL,
        max_tokens: 4000,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: chunk }]
      });
      const raw = (message.content || []).map(b => b.type === 'text' ? b.text : '').join('').trim();
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) allEntries.push(...parsed);
      } catch (e) {
        console.error('Upload extraction: unparseable chunk response, skipping chunk.');
      }
    }
    res.json({ fileName: req.file.originalname, defaultSourceDoc, entries: allEntries.slice(0, 60) });
  } catch (err) {
    console.error('LLM /api/upload extraction failed:', err.message);
    res.status(502).json({ error: 'The document was read, but extracting entries from it failed: ' + err.message });
  }
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
  console.log('  MR Nexis is running.');
  console.log('  Open http://localhost:' + PORT + ' in your browser.');
  console.log('  Knowledge base: ' + readJson(KB_FILE, []).length + ' entries loaded from data/kb.json');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
