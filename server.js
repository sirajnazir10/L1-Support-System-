// MR Nexis — local server
// Serves the web app and a small JSON API for the knowledge base, tickets,
// the continuous-learning log, and the document upload library. Everything
// persists to data/nexis.db (SQLite) so the app keeps its state across
// restarts; data/kb.json is kept as a human-readable, git-diffable mirror of
// the kb_entries table, regenerated after every KB write.

const express = require('express');
const path = require('path');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const store = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------- LLM (optional — app works without it, see /api/llm-status) ----------------
// Reads the key from the environment only; never hardcode or log it. Everything that calls
// this stays behind an `llmAvailable()` check so a missing/invalid key degrades to the
// existing local keyword-matching engine (client-side) instead of breaking the app.
const NEXIS_MODEL = process.env.NEXIS_MODEL || 'claude-sonnet-5';
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
function llmAvailable() { return !!anthropic; }

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB/file

app.use(express.json({ limit: '15mb' })); // generous limit so attached screenshots (base64) fit
app.use(express.static(path.join(__dirname, 'public')));

function escapeHtmlLite(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------- Knowledge base ----------------
// GET all entries
app.get('/api/kb', (req, res) => {
  res.json(store.getKb());
});

// Add a new entry — this is how the KB grows: an agent, or a document-upload
// review pass, posts a new sourced entry here.
app.post('/api/kb', (req, res) => {
  const { title, sourceDoc, page, keywords, answer, documentId } = req.body || {};
  if (!title || !sourceDoc || !answer) {
    return res.status(400).json({ error: 'title, sourceDoc, and answer are required.' });
  }
  const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
  const entry = {
    id: 'custom-' + slug + '-' + Date.now().toString(36),
    title: String(title),
    sourceDoc: String(sourceDoc),
    page: Number(page) || 0,
    keywords: Array.isArray(keywords) ? keywords : String(keywords || '').split(',').map(s => s.trim()).filter(Boolean),
    answer: String(answer),
    documentId: documentId ? Number(documentId) : undefined
  };
  store.addKbEntry(entry);
  store.appendLog(`<b>Knowledge base updated</b> — new entry "${escapeHtmlLite(entry.title)}" added (source: ${escapeHtmlLite(entry.sourceDoc)}).`);
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

// ---------------- Document library (upload -> stored -> optionally extracted into KB entries) ----------------
// Uploaded files are parsed to text and persisted in the documents table immediately (this works
// even without an LLM key — it's just storage). Turning a stored document's text into proposed
// KB entries is a separate step that does require the LLM; nothing is added to the KB
// automatically — the caller reviews/edits/approves each proposed entry (saved individually
// through the existing POST /api/kb, tagged with documentId) before anything persists there.
async function extractTextFromFile(originalname, buffer) {
  const ext = path.extname(originalname).toLowerCase();
  if (ext === '.pdf') {
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (ext === '.docx' || ext === '.doc') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (ext === '.txt' || ext === '.md') {
    return buffer.toString('utf8');
  }
  return null; // unsupported type — caller checks for this
}

app.post('/api/documents', upload.array('files', 20), async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded (expected multipart field "files").' });
  const results = [];
  for (const file of req.files) {
    const ext = path.extname(file.originalname).toLowerCase();
    let text;
    try {
      text = await extractTextFromFile(file.originalname, file.buffer);
    } catch (err) {
      results.push({ fileName: file.originalname, error: 'Could not read this file: ' + err.message });
      continue;
    }
    if (text === null) {
      results.push({ fileName: file.originalname, error: 'Unsupported file type — upload a PDF, Word (.docx), .txt, or .md file.' });
      continue;
    }
    text = text.trim();
    if (!text) {
      results.push({ fileName: file.originalname, error: 'No extractable text found in this file.' });
      continue;
    }
    const doc = store.createDocument(file.originalname, ext, text);
    store.appendLog(`<b>Document uploaded</b> — "${escapeHtmlLite(file.originalname)}" added to the document library.`);
    results.push({ id: doc.id, fileName: doc.fileName, status: doc.status, textLength: text.length });
  }
  res.status(201).json({ documents: results });
});

app.get('/api/documents', (req, res) => {
  res.json(store.listDocuments());
});

app.delete('/api/documents/:id', (req, res) => {
  const ok = store.deleteDocument(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Document not found.' });
  res.json({ ok: true });
});

const EXTRACTION_SYSTEM_PROMPT_TEMPLATE = (defaultSourceDoc) => `You split a support/product document into distinct, self-contained knowledge-base entries.
Each entry must be a single clear question-and-answer unit a customer might plausibly ask about — don't split one coherent idea into fragments, and don't merge unrelated topics into one entry.
Only use facts actually present in the document — never add outside information.
Respond with ONLY a JSON array, no other text, of objects matching exactly:
{"title": "short descriptive title", "sourceDoc": "${defaultSourceDoc}", "page": 1, "keywords": ["3-8 short search phrases a customer would type"], "answer": "the full answer in plain language, grounded only in the document text"}
If the document is too short or unclear to split meaningfully, return a single entry covering it as a whole. Cap it at 40 entries.`;

app.post('/api/documents/:id/extract', async (req, res) => {
  if (!llmAvailable()) {
    return res.status(503).json({ error: 'Extracting KB entries requires the LLM, and no API key is configured (set ANTHROPIC_API_KEY on the server).' });
  }
  const doc = store.getDocument(Number(req.params.id));
  if (!doc) return res.status(404).json({ error: 'Document not found.' });

  const defaultSourceDoc = path.basename(doc.fileName, path.extname(doc.fileName));
  const systemPrompt = EXTRACTION_SYSTEM_PROMPT_TEMPLATE(defaultSourceDoc);
  try {
    // Large documents are chunked so extraction stays within the model's context/output limits.
    const CHUNK_SIZE = 12000;
    const text = doc.extractedText;
    const chunks = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE) chunks.push(text.slice(i, i + CHUNK_SIZE));

    const allEntries = [];
    for (const chunk of chunks.slice(0, 10)) { // hard cap: 10 chunks (~120k chars) per document
      const message = await anthropic.messages.create({
        model: NEXIS_MODEL,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: chunk }]
      });
      const raw = (message.content || []).map(b => b.type === 'text' ? b.text : '').join('').trim();
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) allEntries.push(...parsed);
      } catch (e) {
        console.error('Document extraction: unparseable chunk response, skipping chunk.');
      }
    }
    res.json({ documentId: doc.id, fileName: doc.fileName, defaultSourceDoc, entries: allEntries.slice(0, 60) });
  } catch (err) {
    console.error('LLM document extraction failed:', err.message);
    res.status(502).json({ error: 'The document was read, but extracting entries from it failed: ' + err.message });
  }
});

// ---------------- Tickets ----------------
app.get('/api/tickets', (req, res) => {
  res.json(store.getTickets());
});

app.post('/api/tickets', (req, res) => {
  const ticket = Object.assign({ id: 'MR-' + (1000 + store.countTickets() + 1), createdAt: new Date().toISOString() }, req.body);
  store.addTicket(ticket);
  res.status(201).json(ticket);
});

app.patch('/api/tickets/:id', (req, res) => {
  const updated = store.updateTicket(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Ticket not found.' });
  res.json(updated);
});

// ---------------- Learning log ----------------
app.get('/api/log', (req, res) => {
  res.json(store.getLog());
});

app.post('/api/log', (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text is required.' });
  store.appendLog(String(text));
  res.status(201).json({ ok: true });
});

app.listen(PORT, () => {
  console.log('');
  console.log('  MR Nexis is running.');
  console.log('  Open http://localhost:' + PORT + ' in your browser.');
  console.log('  Knowledge base: ' + store.getKb().length + ' entries loaded from data/nexis.db');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
