// MR Nexis — SQLite persistence layer.
// Replaces the old flat data/*.json files with a real embedded database
// (data/nexis.db) so writes are atomic/concurrency-safe instead of
// read-whole-file/parse/mutate/write-whole-file. kb.json is still kept as a
// human-readable, git-diffable export of the kb_entries table (regenerated
// after every KB write) — SQLite is the source of truth at runtime, kb.json
// is a mirror for review/manual editing/git history.

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'nexis.db');
const KB_EXPORT_FILE = path.join(DATA_DIR, 'kb.json');
const LEGACY_TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
const LEGACY_LOG_FILE = path.join(DATA_DIR, 'learning-log.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const isFreshDb = !fs.existsSync(DB_FILE);

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS kb_entries (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    sourceDoc TEXT NOT NULL,
    page INTEGER DEFAULT 0,
    keywords TEXT NOT NULL DEFAULT '[]',
    answer TEXT NOT NULL,
    documentId INTEGER REFERENCES documents(id) ON DELETE SET NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    createdAt TEXT,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS learning_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    text TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fileName TEXT NOT NULL,
    fileType TEXT,
    extractedText TEXT NOT NULL,
    uploadedAt TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'pending'
  );

  -- Full-text search over the raw material that never becomes a curated KB entry:
  -- whole uploaded documents (as-is, no LLM extraction needed) and past resolved
  -- tickets. Used as a fallback net when the curated, honesty-gated KB search
  -- (client-side) doesn't have a confident answer — never as the primary source.
  CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(doc_id UNINDEXED, fileName, body);
  CREATE VIRTUAL TABLE IF NOT EXISTS tickets_fts USING fts5(ticket_id UNINDEXED, subject, draft);
`);

// ---------------- one-time import from the legacy JSON files ----------------
// Only runs the first time nexis.db is created, so re-running the server never
// re-imports or duplicates rows.
if (isFreshDb) {
  const importKb = db.transaction((entries) => {
    const stmt = db.prepare(`INSERT INTO kb_entries (id, title, sourceDoc, page, keywords, answer) VALUES (@id, @title, @sourceDoc, @page, @keywords, @answer)`);
    entries.forEach(e => stmt.run({
      id: e.id, title: e.title, sourceDoc: e.sourceDoc, page: e.page || 0,
      keywords: JSON.stringify(e.keywords || []), answer: e.answer
    }));
  });
  if (fs.existsSync(KB_EXPORT_FILE)) {
    try {
      const entries = JSON.parse(fs.readFileSync(KB_EXPORT_FILE, 'utf8') || '[]');
      if (Array.isArray(entries) && entries.length) importKb(entries);
      console.log('  Imported ' + entries.length + ' KB entries from data/kb.json into data/nexis.db.');
    } catch (err) { console.error('KB import from kb.json failed:', err.message); }
  }

  const importTickets = db.transaction((tickets) => {
    const stmt = db.prepare(`INSERT INTO tickets (id, createdAt, data) VALUES (@id, @createdAt, @data)`);
    tickets.forEach(t => stmt.run({ id: t.id, createdAt: t.createdAt || null, data: JSON.stringify(t) }));
  });
  if (fs.existsSync(LEGACY_TICKETS_FILE)) {
    try {
      const tickets = JSON.parse(fs.readFileSync(LEGACY_TICKETS_FILE, 'utf8') || '[]');
      if (Array.isArray(tickets) && tickets.length) importTickets(tickets);
      console.log('  Imported ' + tickets.length + ' tickets from data/tickets.json into data/nexis.db.');
    } catch (err) { console.error('Ticket import failed:', err.message); }
  }

  const importLog = db.transaction((entries) => {
    const stmt = db.prepare(`INSERT INTO learning_log (ts, text) VALUES (@ts, @text)`);
    entries.slice().reverse().forEach(e => stmt.run({ ts: e.ts, text: e.text })); // reverse: oldest first, so AUTOINCREMENT order matches original recency order
  });
  if (fs.existsSync(LEGACY_LOG_FILE)) {
    try {
      const entries = JSON.parse(fs.readFileSync(LEGACY_LOG_FILE, 'utf8') || '[]');
      if (Array.isArray(entries) && entries.length) importLog(entries);
      console.log('  Imported ' + entries.length + ' learning-log entries from data/learning-log.json into data/nexis.db.');
    } catch (err) { console.error('Learning log import failed:', err.message); }
  }
}

// FTS5 tables here are plain (not "external content"), so they're populated explicitly
// rather than kept in sync via triggers — simplest correct option at this data volume.
// Rebuilt from scratch on every boot (after any one-time import above) so they can
// never drift from the source tables, then kept current incrementally as new
// documents/tickets are added during the session (see createDocument/addTicket/deleteDocument).
db.exec('DELETE FROM documents_fts; DELETE FROM tickets_fts;');
db.exec(`INSERT INTO documents_fts (doc_id, fileName, body) SELECT id, fileName, extractedText FROM documents`);
db.exec(`
  INSERT INTO tickets_fts (ticket_id, subject, draft)
  SELECT id, json_extract(data, '$.subject'), json_extract(data, '$.draft') FROM tickets
`);

function rowToKbEntry(row) {
  return { id: row.id, title: row.title, sourceDoc: row.sourceDoc, page: row.page, keywords: JSON.parse(row.keywords), answer: row.answer, documentId: row.documentId || undefined };
}

// ---------------- Knowledge base ----------------
function getKb() {
  return db.prepare('SELECT * FROM kb_entries ORDER BY rowid ASC').all().map(rowToKbEntry);
}
function exportKbJson() {
  fs.writeFileSync(KB_EXPORT_FILE, JSON.stringify(getKb(), null, 2), 'utf8');
}
const insertKbStmt = db.prepare(`INSERT INTO kb_entries (id, title, sourceDoc, page, keywords, answer, documentId) VALUES (@id, @title, @sourceDoc, @page, @keywords, @answer, @documentId)`);
function addKbEntry(entry) {
  insertKbStmt.run({
    id: entry.id, title: entry.title, sourceDoc: entry.sourceDoc, page: entry.page || 0,
    keywords: JSON.stringify(entry.keywords || []), answer: entry.answer, documentId: entry.documentId || null
  });
  if (entry.documentId) {
    db.prepare(`UPDATE documents SET status = 'processed' WHERE id = ?`).run(entry.documentId);
  }
  exportKbJson();
  return entry;
}

// ---------------- Tickets ----------------
function getTickets() {
  return db.prepare('SELECT data FROM tickets ORDER BY rowid ASC').all().map(r => JSON.parse(r.data));
}
function countTickets() {
  return db.prepare('SELECT COUNT(*) AS n FROM tickets').get().n;
}
function addTicket(ticket) {
  db.prepare('INSERT INTO tickets (id, createdAt, data) VALUES (@id, @createdAt, @data)').run({
    id: ticket.id, createdAt: ticket.createdAt || null, data: JSON.stringify(ticket)
  });
  db.prepare('INSERT INTO tickets_fts (ticket_id, subject, draft) VALUES (?, ?, ?)').run(ticket.id, ticket.subject || '', ticket.draft || '');
  return ticket;
}
function updateTicket(id, patch) {
  const row = db.prepare('SELECT data FROM tickets WHERE id = ?').get(id);
  if (!row) return null;
  const merged = Object.assign({}, JSON.parse(row.data), patch);
  db.prepare('UPDATE tickets SET data = ? WHERE id = ?').run(JSON.stringify(merged), id);
  db.prepare('UPDATE tickets_fts SET subject = ?, draft = ? WHERE ticket_id = ?').run(merged.subject || '', merged.draft || '', id);
  return merged;
}

// ---------------- Learning log ----------------
function getLog() {
  return db.prepare('SELECT ts, text FROM learning_log ORDER BY seq DESC LIMIT 500').all();
}
function appendLog(text) {
  db.prepare('INSERT INTO learning_log (ts, text) VALUES (?, ?)').run(new Date().toISOString(), text);
  // keep the table itself from growing unbounded — mirror the old "keep last 500" behaviour
  db.prepare(`DELETE FROM learning_log WHERE seq NOT IN (SELECT seq FROM learning_log ORDER BY seq DESC LIMIT 500)`).run();
}

// ---------------- Documents (upload library) ----------------
function createDocument(fileName, fileType, extractedText) {
  const info = db.prepare('INSERT INTO documents (fileName, fileType, extractedText) VALUES (?, ?, ?)').run(fileName, fileType, extractedText);
  db.prepare('INSERT INTO documents_fts (doc_id, fileName, body) VALUES (?, ?, ?)').run(info.lastInsertRowid, fileName, extractedText);
  return getDocument(info.lastInsertRowid);
}
function getDocument(id) {
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
}
function listDocuments() {
  return db.prepare(`
    SELECT d.id, d.fileName, d.fileType, d.uploadedAt, d.status,
      (SELECT COUNT(*) FROM kb_entries k WHERE k.documentId = d.id) AS entryCount,
      length(d.extractedText) AS textLength
    FROM documents d ORDER BY d.uploadedAt DESC
  `).all();
}
function deleteDocument(id) {
  const info = db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  db.prepare('DELETE FROM documents_fts WHERE doc_id = ?').run(id);
  return info.changes > 0;
}

// ---------------- Fallback full-text search (documents + past tickets) ----------------
// Only meant to be consulted when the curated, client-side KB search doesn't have a
// confident match — surfaces raw, unverified material ("found a mention of this in...")
// rather than ever standing in for a reviewed knowledge-base answer.
const FTS_STOPWORDS = new Set(['the','is','a','an','and','or','to','of','for','in','on','with','how','what','why','when','where','do','does','did','i','my','me','can','you','your','please','it','this','that','are','was','were','be','been','have','has','had','not','from','about','get','got']);
function ftsQueryFrom(text) {
  const tokens = String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const significant = tokens.filter(t => t.length >= 3 && !FTS_STOPWORDS.has(t));
  if (!significant.length) return null;
  return significant.slice(0, 12).map(t => t + '*').join(' OR ');
}

function searchDocuments(text, limit) {
  const q = ftsQueryFrom(text);
  if (!q) return [];
  try {
    return db.prepare(`
      SELECT doc_id AS documentId, fileName, snippet(documents_fts, 2, '[', ']', ' … ', 30) AS snippet, bm25(documents_fts) AS rank
      FROM documents_fts WHERE documents_fts MATCH ? ORDER BY rank LIMIT ?
    `).all(q, limit || 3);
  } catch (err) { console.error('Document search failed:', err.message); return []; }
}

function searchTickets(text, limit) {
  const q = ftsQueryFrom(text);
  if (!q) return [];
  try {
    return db.prepare(`
      SELECT ticket_id AS ticketId, subject, snippet(tickets_fts, 2, '[', ']', ' … ', 30) AS snippet, bm25(tickets_fts) AS rank
      FROM tickets_fts WHERE tickets_fts MATCH ? ORDER BY rank LIMIT ?
    `).all(q, limit || 3);
  } catch (err) { console.error('Ticket search failed:', err.message); return []; }
}

module.exports = {
  getKb, addKbEntry, exportKbJson,
  getTickets, addTicket, updateTicket, countTickets,
  getLog, appendLog,
  createDocument, getDocument, listDocuments, deleteDocument,
  searchDocuments, searchTickets,
};
