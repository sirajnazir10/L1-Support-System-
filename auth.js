// MR Nexis — authentication.
// Password hashing (scrypt, from Node's crypto — no extra dependency), session
// tokens in an httpOnly cookie, and the middleware every conversation route
// sits behind.

const crypto = require('crypto');
const store = require('./chat-store');

const COOKIE_NAME = 'nexis_session';
const SESSION_DAYS = 30;
const SCRYPT_KEYLEN = 64;

// ---------------- passwords ----------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${derived}`;
}
function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expected] = parts;
  const derived = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
  // Constant-time compare so a wrong password can't be narrowed down by timing.
  const a = Buffer.from(derived, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function passwordProblem(password) {
  const p = String(password || '');
  if (p.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-zA-Z]/.test(p) || !/[0-9]/.test(p)) return 'Password must contain both a letter and a number.';
  return null;
}
// Deliberately permissive: the only reliable test of an address is sending to
// it, and a stricter pattern mostly rejects valid, unusual addresses.
function emailProblem(email) {
  const e = String(email || '').trim();
  if (!e) return 'Email is required — your account and chat history are tied to it.';
  if (e.length > 200) return 'That email address is too long.';
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(e)) return 'Enter a valid email address.';
  return null;
}
function usernameProblem(username) {
  const u = String(username || '').trim();
  if (u.length < 3) return 'Username must be at least 3 characters.';
  if (u.length > 40) return 'Username must be 40 characters or fewer.';
  if (!/^[a-zA-Z0-9._@-]+$/.test(u)) return 'Username can only contain letters, numbers, and . _ - @';
  return null;
}

// ---------------- sessions ----------------
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function issueSession(res, req, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  store.createSession(userId, hashToken(token), expiresAt, req.headers['user-agent']);
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}` + (secure ? '; Secure' : ''));
  return token;
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

// Resolves the caller from their cookie. Attaches req.user / req.sessionTokenHash
// when valid; never throws, so public routes can use it too.
function attachUser(req, res, next) {
  const token = readCookie(req, COOKIE_NAME);
  if (token) {
    const tokenHash = hashToken(token);
    const session = store.getSession(tokenHash);
    if (session && session.expiresAt > new Date().toISOString()) {
      const user = store.getUserById(session.userId);
      if (user) {
        req.user = user;
        req.sessionTokenHash = tokenHash;
        store.touchSession(tokenHash);
      }
    } else if (session) {
      store.deleteSession(tokenHash);
    }
  }
  next();
}
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  next();
}

// Loads a conversation and proves it belongs to the caller before any handler
// touches it — this is the single gate that keeps accounts separated.
function requireOwnedConversation(req, res, next) {
  const conversation = store.getConversation(req.user.id, req.params.id);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  req.conversation = conversation;
  next();
}

// ---------------- brute-force throttling ----------------
// In-memory is the right scope here: the app is a single local/on-prem process,
// and a restart clearing the counter is acceptable for this threat model.
const attempts = new Map();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

function loginThrottle(key) {
  const now = Date.now();
  const record = attempts.get(key);
  if (record && now - record.first > WINDOW_MS) { attempts.delete(key); return { blocked: false }; }
  if (record && record.count >= MAX_ATTEMPTS) {
    return { blocked: true, retryInSeconds: Math.ceil((WINDOW_MS - (now - record.first)) / 1000) };
  }
  return { blocked: false };
}
function recordFailedLogin(key) {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || now - record.first > WINDOW_MS) attempts.set(key, { first: now, count: 1 });
  else record.count += 1;
}
function clearLoginAttempts(key) { attempts.delete(key); }

module.exports = {
  COOKIE_NAME, hashPassword, verifyPassword, passwordProblem, usernameProblem, emailProblem,
  issueSession, clearSessionCookie, readCookie, hashToken,
  attachUser, requireAuth, requireOwnedConversation,
  loginThrottle, recordFailedLogin, clearLoginAttempts
};
