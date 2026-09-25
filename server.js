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
const chat = require('./chat-store');
const auth = require('./auth');
const engine = require('./nexis-engine');
const version = require('./version');

// Fails the boot rather than serving a build that misreports its own number.
// A version a customer quotes back has to be the one the team looks up.
version.assertVersionsAgree();

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
app.use(auth.attachUser);

// The chat workspace is the front door; the original ticket console stays
// reachable at /tickets for the existing workflow.
app.get('/', (req, res) => res.redirect(req.user ? '/chat.html' : '/login.html'));
app.get('/tickets', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use(express.static(path.join(__dirname, 'public')));

chat.purgeExpiredSessions();

function escapeHtmlLite(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============================================================
//  Accounts & sessions
// ============================================================
const CUSTOMER_TYPES = ['new', 'existing'];

app.post('/api/auth/register', (req, res) => {
  const { username, password, displayName, email, customerType, organization } = req.body || {};
  const usernameIssue = auth.usernameProblem(username);
  if (usernameIssue) return res.status(400).json({ error: usernameIssue });
  const emailIssue = auth.emailProblem(email);
  if (emailIssue) return res.status(400).json({ error: emailIssue });
  const passwordIssue = auth.passwordProblem(password);
  if (passwordIssue) return res.status(400).json({ error: passwordIssue });
  if (!CUSTOMER_TYPES.includes(customerType)) {
    return res.status(400).json({ error: 'Tell us whether you are a new or existing customer.' });
  }
  // An existing customer's organisation is what ties their chats to a known
  // environment, so it is required for them and meaningless for a new one.
  if (customerType === 'existing' && !String(organization || '').trim()) {
    return res.status(400).json({ error: 'Enter your company or organization name.' });
  }
  if (chat.getUserByUsername(String(username).trim())) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }
  if (chat.getUserByEmail(String(email).trim())) {
    return res.status(409).json({ error: 'An account already exists for that email — sign in instead.' });
  }
  // First account to register administers the workspace (reviews proposed knowledge).
  const role = chat.countUsers() === 0 ? 'admin' : 'agent';
  const user = chat.createUser({
    username: String(username).trim(),
    displayName: displayName ? String(displayName).trim() : null,
    email: String(email).trim(),
    passwordHash: auth.hashPassword(password),
    role,
    customerType,
    organization: organization ? String(organization).trim() : null
  });
  auth.issueSession(res, req, user.id);
  chat.touchLogin(user.id);
  res.status(201).json({ user: chat.publicUser(chat.getUserById(user.id)) });
});

app.post('/api/auth/login', (req, res) => {
  const { username, email, identifier, password } = req.body || {};
  const login = identifier || email || username;
  const throttleKey = String(login || '').toLowerCase() + '|' + (req.ip || '');
  const throttle = auth.loginThrottle(throttleKey);
  if (throttle.blocked) {
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${Math.ceil(throttle.retryInSeconds / 60)} minute(s).` });
  }
  const user = login ? chat.getUserByLogin(login) : null;
  // Same message either way — it shouldn't be possible to probe which accounts exist.
  if (!user || !auth.verifyPassword(password, user.passwordHash)) {
    auth.recordFailedLogin(throttleKey);
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  auth.clearLoginAttempts(throttleKey);
  auth.issueSession(res, req, user.id);
  chat.touchLogin(user.id);
  res.json({ user: chat.publicUser(chat.getUserById(user.id)) });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.sessionTokenHash) chat.deleteSession(req.sessionTokenHash);
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ user: chat.publicUser(req.user), llm: engine.llmAvailable() });
});

app.patch('/api/auth/profile', auth.requireAuth, (req, res) => {
  const { displayName, email, customerType, organization } = req.body || {};
  if (email !== undefined && String(email).trim() !== (req.user.email || '')) {
    const emailIssue = auth.emailProblem(email);
    if (emailIssue) return res.status(400).json({ error: emailIssue });
    const owner = chat.getUserByEmail(String(email).trim());
    if (owner && owner.id !== req.user.id) {
      return res.status(409).json({ error: 'Another account already uses that email.' });
    }
  }
  if (customerType !== undefined && !CUSTOMER_TYPES.includes(customerType)) {
    return res.status(400).json({ error: 'customerType must be "new" or "existing".' });
  }
  res.json({ user: chat.publicUser(chat.updateUserProfile(req.user.id, { displayName, email, customerType, organization })) });
});

app.patch('/api/auth/preferences', auth.requireAuth, (req, res) => {
  const current = chat.publicUser(req.user).preferences;
  const merged = Object.assign({}, current, req.body || {});
  res.json({ user: chat.publicUser(chat.updateUserPreferences(req.user.id, merged)) });
});

app.post('/api/auth/password', auth.requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!auth.verifyPassword(currentPassword, req.user.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  const issue = auth.passwordProblem(newPassword);
  if (issue) return res.status(400).json({ error: issue });
  chat.updatePassword(req.user.id, auth.hashPassword(newPassword));
  // Changing a password ends every other session.
  chat.deleteOtherSessions(req.user.id, req.sessionTokenHash);
  res.json({ ok: true });
});

app.get('/api/auth/sessions', auth.requireAuth, (req, res) => {
  res.json(chat.listSessions(req.user.id).map(s => ({
    current: s.tokenHash === req.sessionTokenHash,
    createdAt: s.createdAt, expiresAt: s.expiresAt, lastSeenAt: s.lastSeenAt, userAgent: s.userAgent
  })));
});

app.delete('/api/auth/sessions', auth.requireAuth, (req, res) => {
  chat.deleteOtherSessions(req.user.id, req.sessionTokenHash);
  res.json({ ok: true });
});

// ============================================================
//  Conversations
// ============================================================
app.get('/api/conversations', auth.requireAuth, (req, res) => {
  res.json(chat.listConversations(req.user.id, {
    search: req.query.q,
    sort: req.query.sort,
    includeArchived: req.query.archived === 'true'
  }));
});

app.post('/api/conversations', auth.requireAuth, (req, res) => {
  res.status(201).json(chat.createConversation(req.user.id, (req.body && req.body.title) || 'New chat'));
});

app.get('/api/conversations/:id', auth.requireAuth, auth.requireOwnedConversation, (req, res) => {
  // Internal reasoning is only included when explicitly requested, so the
  // customer-facing view can never accidentally render it.
  const includeAnalysis = req.query.analysis === 'true';
  res.json({
    conversation: req.conversation,
    messages: chat.getMessages(req.conversation.id).map(m => chat.shapeMessage(m, includeAnalysis)),
    attachments: chat.listAttachments(req.conversation.id)
  });
});

app.patch('/api/conversations/:id', auth.requireAuth, auth.requireOwnedConversation, (req, res) => {
  const { title, pinned, archived, module } = req.body || {};
  const patch = { keepTimestamp: true };
  if (title !== undefined) { patch.title = String(title).slice(0, 120); patch.titleIsCustom = true; }
  if (pinned !== undefined) patch.pinned = pinned;
  if (archived !== undefined) patch.archived = archived;
  if (module !== undefined) patch.module = module;
  res.json(chat.updateConversation(req.user.id, req.conversation.id, patch));
});

app.delete('/api/conversations/:id', auth.requireAuth, auth.requireOwnedConversation, (req, res) => {
  chat.deleteConversation(req.user.id, req.conversation.id);
  res.json({ ok: true });
});

// Clear all history for the signed-in account. Deliberately requires an explicit
// confirm flag so a stray DELETE can't wipe someone's workspace.
app.delete('/api/conversations', auth.requireAuth, (req, res) => {
  if (req.query.confirm !== 'true') return res.status(400).json({ error: 'Pass ?confirm=true to clear all conversations.' });
  res.json({ ok: true, deleted: chat.deleteAllConversations(req.user.id) });
});

// ---------------- attachments ----------------
app.post('/api/conversations/:id/attachments', auth.requireAuth, auth.requireOwnedConversation, upload.array('files', 10), async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded (expected multipart field "files").' });
  const saved = [];
  for (const file of req.files) {
    const ext = path.extname(file.originalname).toLowerCase();
    const isImage = /^image\//.test(file.mimetype || '');
    let extractedText = null;
    try {
      if (!isImage) extractedText = await extractTextFromFile(file.originalname, file.buffer);
    } catch (err) {
      extractedText = null;
    }
    saved.push(chat.addAttachment({
      conversationId: req.conversation.id,
      userId: req.user.id,
      fileName: file.originalname,
      fileType: file.mimetype || ext,
      byteSize: file.size,
      extractedText: extractedText ? extractedText.trim().slice(0, 200000) : null,
      // Images are kept inline so the conversation renders exactly as it was left.
      previewData: isImage && file.size <= 4 * 1024 * 1024
        ? `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
        : null
    }));
  }
  res.status(201).json({ attachments: saved });
});

app.get('/api/attachments/:id', auth.requireAuth, (req, res) => {
  const attachment = chat.getAttachment(req.user.id, Number(req.params.id));
  if (!attachment) return res.status(404).json({ error: 'Attachment not found.' });
  res.json({
    id: attachment.id, fileName: attachment.fileName, fileType: attachment.fileType,
    byteSize: attachment.byteSize, previewData: attachment.previewData,
    extractedText: attachment.extractedText ? attachment.extractedText.slice(0, 20000) : null
  });
});

// ---------------- the chat turn ----------------
app.post('/api/conversations/:id/messages', auth.requireAuth, auth.requireOwnedConversation, async (req, res) => {
  const { content, attachmentIds } = req.body || {};
  if (!content || !String(content).trim()) return res.status(400).json({ error: 'content is required.' });
  const text = String(content).trim();
  const conversation = req.conversation;

  try {
    const history = chat.getMessages(conversation.id).map(m => chat.shapeMessage(m, false));

    const userMessage = chat.addMessage(conversation.id, { role: 'user', content: text });
    if (Array.isArray(attachmentIds) && attachmentIds.length) {
      chat.linkAttachmentsToMessage(conversation.id, attachmentIds.map(Number), userMessage.id);
    }

    // Did the agent just teach Nexis something? Recorded against this
    // conversation and checked against the documentation, but never promoted
    // into the shared knowledge base without an explicit review.
    let learnedEntry = null;
    if (engine.looksLikeKnowledge(text)) {
      const lastAssistant = [...history].reverse().find(m => m.role === 'assistant');
      const validation = await engine.validateClaim(text, lastAssistant ? lastAssistant.content.slice(0, 600) : null);
      learnedEntry = chat.addLearnedKnowledge({
        userId: req.user.id,
        conversationId: conversation.id,
        claim: text,
        topic: validation.topic,
        keywords: validation.keywords,
        sourceQuote: lastAssistant ? lastAssistant.content.slice(0, 600) : null,
        status: validation.verdict === 'supported' ? 'verified' : 'proposed',
        scope: 'conversation',
        conflictsWith: validation.conflictsWith,
        validationNote: validation.note
      });
    }

    const learned = chat.knowledgeForConversation(conversation.id);
    const attachments = chat.conversationAttachmentText(conversation.id, 4);
    const reply = await engine.answer({
      message: text, history, learned, attachments, learnedFromThisTurn: learnedEntry,
      profile: { customerType: req.user.customerType, organization: req.user.organization }
    });

    const assistantMessage = chat.addMessage(conversation.id, {
      role: 'assistant',
      content: reply.answer,
      analysis: Object.assign({}, reply.analysis, {
        understanding: reply.understanding,
        nextStep: reply.nextStep,
        confident: reply.confident,
        learnedFromThisTurn: learnedEntry ? { id: learnedEntry.id, status: learnedEntry.status, note: learnedEntry.validationNote } : null
      }),
      sources: reply.sources
    });

    // Title and module are derived from the opening exchange, once.
    const patch = {};
    if (!conversation.titleIsCustom && history.length === 0) {
      patch.title = await engine.generateTitle(text);
    }
    if (!conversation.module && reply.analysis && reply.analysis.module) {
      patch.module = reply.analysis.module;
    }
    const updated = Object.keys(patch).length
      ? chat.updateConversation(req.user.id, conversation.id, patch)
      : chat.getConversation(req.user.id, conversation.id);

    res.status(201).json({
      conversation: updated,
      userMessage: chat.shapeMessage(userMessage, false),
      assistantMessage: chat.shapeMessage(assistantMessage, true),
      nextStep: reply.nextStep,
      learned: learnedEntry
        ? { id: learnedEntry.id, status: learnedEntry.status, note: learnedEntry.validationNote, conflictsWith: learnedEntry.conflictsWith }
        : null
    });
  } catch (err) {
    console.error('Chat turn failed:', err);
    res.status(500).json({ error: 'Something went wrong answering that. The message was saved — try again.' });
  }
});

// ============================================================
//  Agent-supplied knowledge review
// ============================================================
app.get('/api/knowledge', auth.requireAuth, (req, res) => {
  res.json(chat.listLearned({
    status: req.query.status,
    conversationId: req.query.conversationId,
    limit: Number(req.query.limit) || 100
  }));
});

// Promoting a claim to the shared knowledge base is an explicit, reviewed
// action — this is the gate that stops one agent's assumption becoming
// everyone's answer.
app.post('/api/knowledge/:id/review', auth.requireAuth, (req, res) => {
  const entry = chat.getLearnedById(Number(req.params.id));
  if (!entry) return res.status(404).json({ error: 'Knowledge entry not found.' });
  const { decision, title, sourceDoc } = req.body || {};
  if (!['verify', 'reject', 'promote'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be "verify", "reject", or "promote".' });
  }
  if (decision === 'reject') {
    return res.json(chat.reviewLearned(entry.id, { status: 'rejected', reviewedBy: req.user.id }));
  }
  if (decision === 'verify') {
    return res.json(chat.reviewLearned(entry.id, { status: 'verified', scope: 'global', reviewedBy: req.user.id }));
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only an admin can write into the shared knowledge base.' });
  }
  const kbEntry = {
    id: 'learned-' + entry.id + '-' + Date.now().toString(36),
    title: String(title || entry.topic || 'Agent-provided knowledge').slice(0, 120),
    sourceDoc: String(sourceDoc || 'Agent-verified knowledge'),
    page: 0,
    keywords: entry.keywords,
    answer: entry.claim
  };
  store.addKbEntry(kbEntry);
  engine.invalidateKbCache();
  store.appendLog(`<b>Knowledge base updated</b> — verified agent knowledge "${escapeHtmlLite(kbEntry.title)}" promoted by ${escapeHtmlLite(req.user.username)}.`);
  res.json(chat.reviewLearned(entry.id, { status: 'verified', scope: 'global', reviewedBy: req.user.id, kbEntryId: kbEntry.id }));
});

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
  engine.invalidateKbCache();
  store.appendLog(`<b>Knowledge base updated</b> — new entry "${escapeHtmlLite(entry.title)}" added (source: ${escapeHtmlLite(entry.sourceDoc)}).`);
  res.status(201).json(entry);
});

// ---------------- LLM-backed answering (optional) ----------------
// Client asks the local keyword engine to retrieve candidate entries first (unchanged —
// entity detection, typo tolerance, ambiguity handling all still happen there), then can send
// those candidates here for a more naturally-drafted answer. This never freelances beyond the
// given candidates and never fabricates a source; if the model doesn't have enough there, it
// says so, the same honesty rule the local engine already follows.
// Unauthenticated on purpose: the build number is what a customer reads back
// when reporting a problem, and asking them to sign in first to find it defeats
// the point. It exposes no data beyond the release record.
app.get('/api/version', (req, res) => {
  res.json({
    version: version.version,
    semantic: version.semantic,
    build: version.buildNumber,
    releaseDate: version.releaseDate,
    node: process.version,
    llm: llmAvailable() ? NEXIS_MODEL : null,
    knowledgeBaseEntries: store.countKb(),
    builds: version.builds
  });
});

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

// ---------------- Fallback search (raw documents + past tickets) ----------------
// This is deliberately separate from GET /api/kb: the customer-facing engine in the
// browser treats the curated KB as the only source it can present as a confirmed
// answer. This endpoint gives it a second, honestly-labelled net to check — whole
// uploaded documents and past resolved tickets — when the curated KB has nothing.
app.get('/api/search', (req, res) => {
  const q = req.query.q || '';
  if (!q.trim()) return res.json({ documents: [], tickets: [] });
  res.json({
    documents: store.searchDocuments(q, 3),
    tickets: store.searchTickets(q, 3)
  });
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
  console.log('  MR Nexis ' + version.version + ' is running.');
  console.log('  Open http://localhost:' + PORT + ' in your browser.');
  console.log('  Knowledge base: ' + store.getKb().length + ' entries loaded from data/nexis.db');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
