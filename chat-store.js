// MR Nexis — persistent chat workspace storage.
// Users, sessions, conversations, messages, attachments and agent-provided
// knowledge. Shares the single SQLite connection from db.js.
//
// Data separation is enforced by shape, not convention:
//   - account data            -> users / sessions
//   - conversation data       -> conversations / messages
//   - uploaded attachments    -> attachments (never merged into the shared KB)
//   - product knowledge       -> kb_entries (db.js) — only ever written after review
//   - internal AI analysis    -> messages.analysis, returned only when explicitly asked for
// Every conversation read/write is scoped by userId so one account can never
// reach another's history.

const crypto = require('crypto');
const { db } = require('./db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    displayName TEXT,
    email TEXT,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'agent',
    customerType TEXT,
    organization TEXT,
    preferences TEXT NOT NULL DEFAULT '{}',
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    lastLoginAt TEXT
  );
  -- The registered email is the account's lasting identity, so it has to be
  -- unique. A partial index keeps legacy rows (which predate the requirement
  -- and may have no email) from blocking the constraint.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(lower(email)) WHERE email IS NOT NULL;

  -- Only a SHA-256 of the session token is stored, so a copy of the database
  -- does not hand over live sessions.
  CREATE TABLE IF NOT EXISTS sessions (
    tokenHash TEXT PRIMARY KEY,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    createdAt TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    lastSeenAt TEXT,
    userAgent TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New chat',
    titleIsCustom INTEGER NOT NULL DEFAULT 0,
    module TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    preview TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(userId, updatedAt DESC);

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    analysis TEXT,
    sources TEXT,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversationId, id);

  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    messageId INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fileName TEXT NOT NULL,
    fileType TEXT,
    byteSize INTEGER,
    extractedText TEXT,
    previewData TEXT,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_attachments_conversation ON attachments(conversationId, id);

  -- Knowledge an agent supplied mid-conversation (a correction, a product
  -- behaviour, a working troubleshooting step). Deliberately NOT written into
  -- kb_entries: it applies to its own conversation immediately, and only
  -- reaches the shared knowledge base after someone explicitly verifies it.
  CREATE TABLE IF NOT EXISTS learned_knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER REFERENCES users(id) ON DELETE SET NULL,
    conversationId TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    claim TEXT NOT NULL,
    topic TEXT,
    keywords TEXT NOT NULL DEFAULT '[]',
    sourceQuote TEXT,
    status TEXT NOT NULL DEFAULT 'proposed',
    scope TEXT NOT NULL DEFAULT 'conversation',
    conflictsWith TEXT NOT NULL DEFAULT '[]',
    validationNote TEXT,
    kbEntryId TEXT,
    createdAt TEXT NOT NULL,
    reviewedAt TEXT,
    reviewedBy INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_learned_conversation ON learned_knowledge(conversationId);
  CREATE INDEX IF NOT EXISTS idx_learned_status ON learned_knowledge(status, scope);
`);

const nowIso = () => new Date().toISOString();

// Additive migration for databases created before these columns existed —
// CREATE TABLE IF NOT EXISTS leaves an older table untouched, so the columns
// have to be added explicitly or every query against them fails.
function ensureColumn(table, column, ddl) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}
ensureColumn('users', 'customerType', 'TEXT');
ensureColumn('users', 'organization', 'TEXT');

// ---------------- users ----------------
function createUser({ username, displayName, email, passwordHash, role, customerType, organization }) {
  const info = db.prepare(`
    INSERT INTO users (username, displayName, email, passwordHash, role, customerType, organization)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(username, displayName || username, email || null, passwordHash, role || 'agent',
         customerType || null, organization || null);
  return getUserById(info.lastInsertRowid);
}
function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}
function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
}
function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(String(email || ''));
}
// Sign-in accepts the registered email or the username — the email is the
// identity people are told to use, but their username still works.
function getUserByLogin(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;
  return (value.includes('@') ? getUserByEmail(value) : null) || getUserByUsername(value) || getUserByEmail(value);
}
function countUsers() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}
function touchLogin(userId) {
  db.prepare('UPDATE users SET lastLoginAt = ? WHERE id = ?').run(nowIso(), userId);
}
function updateUserProfile(userId, { displayName, email, customerType, organization }) {
  db.prepare(`
    UPDATE users SET
      displayName = COALESCE(?, displayName),
      email = COALESCE(?, email),
      customerType = COALESCE(?, customerType),
      organization = COALESCE(?, organization)
    WHERE id = ?
  `).run(displayName ?? null, email ?? null, customerType ?? null, organization ?? null, userId);
  return getUserById(userId);
}
function updateUserPreferences(userId, preferences) {
  db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(JSON.stringify(preferences || {}), userId);
  return getUserById(userId);
}
function updatePassword(userId, passwordHash) {
  db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(passwordHash, userId);
}
// Everything the browser is allowed to see about an account.
function publicUser(row) {
  if (!row) return null;
  let preferences = {};
  try { preferences = JSON.parse(row.preferences || '{}'); } catch (e) { preferences = {}; }
  return {
    id: row.id, username: row.username, displayName: row.displayName || row.username,
    email: row.email || null, role: row.role, preferences,
    customerType: row.customerType || null, organization: row.organization || null,
    createdAt: row.createdAt, lastLoginAt: row.lastLoginAt
  };
}

// ---------------- sessions ----------------
function createSession(userId, tokenHash, expiresAt, userAgent) {
  db.prepare('INSERT INTO sessions (tokenHash, userId, createdAt, expiresAt, lastSeenAt, userAgent) VALUES (?, ?, ?, ?, ?, ?)')
    .run(tokenHash, userId, nowIso(), expiresAt, nowIso(), (userAgent || '').slice(0, 300));
}
function getSession(tokenHash) {
  return db.prepare('SELECT * FROM sessions WHERE tokenHash = ?').get(tokenHash);
}
function touchSession(tokenHash) {
  db.prepare('UPDATE sessions SET lastSeenAt = ? WHERE tokenHash = ?').run(nowIso(), tokenHash);
}
function deleteSession(tokenHash) {
  db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(tokenHash);
}
function deleteOtherSessions(userId, keepTokenHash) {
  db.prepare('DELETE FROM sessions WHERE userId = ? AND tokenHash != ?').run(userId, keepTokenHash);
}
function listSessions(userId) {
  return db.prepare('SELECT tokenHash, createdAt, expiresAt, lastSeenAt, userAgent FROM sessions WHERE userId = ? ORDER BY lastSeenAt DESC').all(userId);
}
function purgeExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expiresAt < ?').run(nowIso());
}

// ---------------- conversations ----------------
function createConversation(userId, title) {
  const id = 'conv-' + crypto.randomBytes(9).toString('hex');
  const ts = nowIso();
  db.prepare('INSERT INTO conversations (id, userId, title, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
    .run(id, userId, title || 'New chat', ts, ts);
  return getConversation(userId, id);
}
// Every accessor takes userId — ownership is checked in the query itself, so a
// guessed conversation id from another account simply returns nothing.
function getConversation(userId, id) {
  return db.prepare('SELECT * FROM conversations WHERE id = ? AND userId = ?').get(id, userId);
}
function listConversations(userId, { search, sort, includeArchived } = {}) {
  const params = { userId };
  let sql = `
    SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversationId = c.id) AS messageCount
    FROM conversations c WHERE c.userId = @userId
  `;
  if (!includeArchived) sql += ' AND c.archived = 0';
  if (search && search.trim()) {
    // Matches title, preview, or anything said inside the conversation.
    sql += ` AND (
      c.title LIKE @like OR c.preview LIKE @like
      OR EXISTS (SELECT 1 FROM messages m2 WHERE m2.conversationId = c.id AND m2.content LIKE @like)
    )`;
    params.like = '%' + search.trim() + '%';
  }
  sql += sort === 'oldest'
    ? ' ORDER BY c.pinned DESC, c.updatedAt ASC'
    : ' ORDER BY c.pinned DESC, c.updatedAt DESC';
  return db.prepare(sql).all(params);
}
function updateConversation(userId, id, patch) {
  const existing = getConversation(userId, id);
  if (!existing) return null;
  const fields = [];
  const params = { id, userId };
  ['title', 'module', 'preview'].forEach((k) => {
    if (patch[k] !== undefined) { fields.push(`${k} = @${k}`); params[k] = patch[k]; }
  });
  ['pinned', 'archived', 'titleIsCustom'].forEach((k) => {
    if (patch[k] !== undefined) { fields.push(`${k} = @${k}`); params[k] = patch[k] ? 1 : 0; }
  });
  if (!fields.length) return existing;
  fields.push('updatedAt = @updatedAt');
  params.updatedAt = patch.keepTimestamp ? existing.updatedAt : nowIso();
  db.prepare(`UPDATE conversations SET ${fields.join(', ')} WHERE id = @id AND userId = @userId`).run(params);
  return getConversation(userId, id);
}
function deleteConversation(userId, id) {
  return db.prepare('DELETE FROM conversations WHERE id = ? AND userId = ?').run(id, userId).changes > 0;
}
function deleteAllConversations(userId) {
  return db.prepare('DELETE FROM conversations WHERE userId = ?').run(userId).changes;
}

// ---------------- messages ----------------
function addMessage(conversationId, { role, content, analysis, sources }) {
  const ts = nowIso();
  const info = db.prepare(`
    INSERT INTO messages (conversationId, role, content, analysis, sources, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(conversationId, role, content, analysis ? JSON.stringify(analysis) : null,
         sources ? JSON.stringify(sources) : null, ts);
  db.prepare('UPDATE conversations SET updatedAt = ?, preview = ? WHERE id = ?')
    .run(ts, String(content).replace(/\s+/g, ' ').slice(0, 160), conversationId);
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
}
function getMessages(conversationId) {
  return db.prepare('SELECT * FROM messages WHERE conversationId = ? ORDER BY id ASC').all(conversationId);
}
// includeAnalysis is opt-in: the internal reasoning trail stays out of the
// customer-facing payload unless the caller explicitly asks for it.
function shapeMessage(row, includeAnalysis) {
  const out = {
    id: row.id, role: row.role, content: row.content, createdAt: row.createdAt,
    sources: row.sources ? JSON.parse(row.sources) : []
  };
  if (includeAnalysis && row.analysis) out.analysis = JSON.parse(row.analysis);
  return out;
}

// ---------------- attachments ----------------
function addAttachment(att) {
  const info = db.prepare(`
    INSERT INTO attachments (conversationId, messageId, userId, fileName, fileType, byteSize, extractedText, previewData, createdAt)
    VALUES (@conversationId, @messageId, @userId, @fileName, @fileType, @byteSize, @extractedText, @previewData, @createdAt)
  `).run({
    conversationId: att.conversationId, messageId: att.messageId || null, userId: att.userId,
    fileName: att.fileName, fileType: att.fileType || null, byteSize: att.byteSize || 0,
    extractedText: att.extractedText || null, previewData: att.previewData || null, createdAt: nowIso()
  });
  return db.prepare('SELECT id, conversationId, messageId, fileName, fileType, byteSize, createdAt FROM attachments WHERE id = ?')
    .get(info.lastInsertRowid);
}
function listAttachments(conversationId) {
  return db.prepare(`
    SELECT id, conversationId, messageId, fileName, fileType, byteSize, createdAt,
           length(COALESCE(extractedText, '')) AS textLength
    FROM attachments WHERE conversationId = ? ORDER BY id ASC
  `).all(conversationId);
}
function getAttachment(userId, id) {
  return db.prepare('SELECT * FROM attachments WHERE id = ? AND userId = ?').get(id, userId);
}
function linkAttachmentsToMessage(conversationId, attachmentIds, messageId) {
  if (!attachmentIds || !attachmentIds.length) return;
  const stmt = db.prepare('UPDATE attachments SET messageId = ? WHERE id = ? AND conversationId = ?');
  db.transaction(() => attachmentIds.forEach((id) => stmt.run(messageId, id, conversationId)))();
}
// Text pulled from files the user attached in THIS conversation — extra grounding
// material for answering, kept scoped so one chat's logs never leak into another.
function conversationAttachmentText(conversationId, limit) {
  return db.prepare(`
    SELECT fileName, extractedText FROM attachments
    WHERE conversationId = ? AND extractedText IS NOT NULL AND extractedText != ''
    ORDER BY id DESC LIMIT ?
  `).all(conversationId, limit || 4);
}

// ---------------- learned knowledge ----------------
function addLearnedKnowledge(entry) {
  const info = db.prepare(`
    INSERT INTO learned_knowledge (userId, conversationId, claim, topic, keywords, sourceQuote, status, scope, conflictsWith, validationNote, createdAt)
    VALUES (@userId, @conversationId, @claim, @topic, @keywords, @sourceQuote, @status, @scope, @conflictsWith, @validationNote, @createdAt)
  `).run({
    userId: entry.userId || null, conversationId: entry.conversationId || null,
    claim: entry.claim, topic: entry.topic || null,
    keywords: JSON.stringify(entry.keywords || []), sourceQuote: entry.sourceQuote || null,
    status: entry.status || 'proposed', scope: entry.scope || 'conversation',
    conflictsWith: JSON.stringify(entry.conflictsWith || []),
    validationNote: entry.validationNote || null, createdAt: nowIso()
  });
  return getLearnedById(info.lastInsertRowid);
}
function getLearnedById(id) {
  const row = db.prepare('SELECT * FROM learned_knowledge WHERE id = ?').get(id);
  return row ? shapeLearned(row) : null;
}
function shapeLearned(row) {
  return Object.assign({}, row, {
    keywords: JSON.parse(row.keywords || '[]'),
    conflictsWith: JSON.parse(row.conflictsWith || '[]')
  });
}
// Knowledge available while answering inside one conversation: everything this
// chat taught Nexis, plus anything already verified for everyone.
function knowledgeForConversation(conversationId) {
  return db.prepare(`
    SELECT * FROM learned_knowledge
    WHERE status != 'rejected' AND (conversationId = ? OR (scope = 'global' AND status = 'verified'))
    ORDER BY id DESC LIMIT 40
  `).all(conversationId).map(shapeLearned);
}
function listLearned({ status, conversationId, limit } = {}) {
  const clauses = [];
  const params = {};
  if (status) { clauses.push('status = @status'); params.status = status; }
  if (conversationId) { clauses.push('conversationId = @conversationId'); params.conversationId = conversationId; }
  params.limit = limit || 100;
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  return db.prepare(`SELECT * FROM learned_knowledge ${where} ORDER BY id DESC LIMIT @limit`).all(params).map(shapeLearned);
}
function reviewLearned(id, { status, scope, reviewedBy, kbEntryId, validationNote }) {
  db.prepare(`
    UPDATE learned_knowledge
    SET status = COALESCE(?, status), scope = COALESCE(?, scope), reviewedBy = ?, reviewedAt = ?,
        kbEntryId = COALESCE(?, kbEntryId), validationNote = COALESCE(?, validationNote)
    WHERE id = ?
  `).run(status || null, scope || null, reviewedBy || null, nowIso(), kbEntryId || null, validationNote || null, id);
  return getLearnedById(id);
}

module.exports = {
  createUser, getUserById, getUserByUsername, getUserByEmail, getUserByLogin, countUsers, touchLogin,
  updateUserProfile, updateUserPreferences, updatePassword, publicUser,
  createSession, getSession, touchSession, deleteSession, deleteOtherSessions, listSessions, purgeExpiredSessions,
  createConversation, getConversation, listConversations, updateConversation, deleteConversation, deleteAllConversations,
  addMessage, getMessages, shapeMessage,
  addAttachment, listAttachments, getAttachment, linkAttachmentsToMessage, conversationAttachmentText,
  addLearnedKnowledge, getLearnedById, knowledgeForConversation, listLearned, reviewLearned
};
