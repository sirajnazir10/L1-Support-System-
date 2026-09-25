// Turns the NextGen online help export into KB entries.
//
//   node tools/ingest-nextgen-help.js --dir "F:/Articles For MR & CP/MR-NG_Online Help" [--dry-run] [--limit N]
//
// Entries are tagged generation='nextgen', because the export documents MR 2.0
// / NextGen — that tag is what stops these pages being offered to a customer on
// MR 1.0 / MR 2025. The exception is the Copilot4DevOps section: that is a
// separate product bound into the same help set, and it is tagged 'both'
// (see PRODUCT_LEVEL_MODULES).
//
// The answer text is assembled from what the page actually contains — its
// prose, its numbered steps, its notes — and nothing else. Where a page has no
// prerequisites or no limitations, the entry simply has no such section. It
// does not get one written for it.

const path = require('path');
const { parseAll } = require('./parse-nextgen-help');
const kbStore = require('../db');

const SOURCE_DOC = 'NextGen Online Help';

const args = process.argv.slice(2);
const argVal = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DIR = argVal('--dir', 'F:/Articles For MR & CP/MR-NG_Online Help');
const DRY_RUN = args.includes('--dry-run');
const LIMIT = Number(argVal('--limit', 0)) || 0;

const slug = (s) => String(s).toLowerCase().replace(/\.htm$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// Keywords are what retrieval actually matches on. Built from the page's own
// title and the module it sits under, plus the phrasings a support agent would
// type — never invented facts, just alternative wordings of the same title.
const KEYWORD_STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'in', 'to', 'for', 'on', 'from', 'with', 'using', 'your', 'its', 'new', 'is', 'are', 'how']);

// Help topics are titled in the gerund ("Creating baselines"); people ask in the
// infinitive ("how do I create a baseline"). Retrieval scores a literal phrase
// hit far above stem overlap, and the stemmer truncates rather than lemmatises,
// so "creating" and "create" never meet on their own. Emitting the infinitive
// form as its own keyword is what closes that gap.
const VERB_BASE = {
  creating: 'create', adding: 'add', deleting: 'delete', editing: 'edit',
  opening: 'open', comparing: 'compare', configuring: 'configure',
  generating: 'generate', saving: 'save', uploading: 'upload',
  downloading: 'download', managing: 'manage', inserting: 'insert',
  removing: 'remove', showing: 'show', selecting: 'select',
  performing: 'perform', publishing: 'publish', designing: 'design',
  modifying: 'modify', importing: 'import', exporting: 'export',
  cloning: 'clone', renaming: 'rename', linking: 'link', responding: 'respond',
  choosing: 'choose', parsing: 'parse', previewing: 'preview', viewing: 'view'
};
const ARTICLE_RE = /^(?:a|an|the)\s+/;
const singular = (w) => (/(ses|xes|zes|ches|shes)$/.test(w) ? w.slice(0, -2) : /[^s]s$/.test(w) ? w.slice(0, -1) : w);

function deriveKeywords(page, moduleName) {
  const out = new Set();
  const title = page.title.toLowerCase().replace(/\s+/g, ' ').trim();
  out.add(title);
  if (moduleName) {
    const mod = moduleName.toLowerCase();
    // The bare module name belongs to the module's OWN page, not to all 34 of
    // its children. Giving every child "smart docs" as a keyword made each of
    // them score identically on "what is Smart Docs" — the module name stopped
    // discriminating at all, every page tied, and the winner was decided by
    // alphabetical id, so the overview lost to "Add Columns in Smart Docs Grid".
    // The qualified form stays: it names this page within the module.
    if (mod === title) out.add(mod);
    else out.add(`${mod} ${title}`);
  }
  // The significant words of the title, so a partial phrasing still matches.
  title.split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !KEYWORD_STOP.has(w)).forEach((w) => out.add(w));

  // The filename is often a fuller name than the <title>. Review_Management.htm
  // is titled just "Review", so nothing in the entry matched someone asking
  // about "review management" — which is what the module is actually called
  // outside the help set. Cheap to include and it costs nothing when the two
  // agree.
  const fromFile = page.fileName.replace(/\.htm$/i, '').replace(/[_-]+/g, ' ').toLowerCase().trim();
  if (fromFile && fromFile !== title) {
    out.add(fromFile);
    fromFile.split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !KEYWORD_STOP.has(w)).forEach((w) => out.add(w));
  }

  const verbMatch = title.match(/^([a-z]+)\b\s*(.*)$/);
  const base = verbMatch && VERB_BASE[verbMatch[1]];
  if (base) {
    // Leading article stripped deliberately. Keeping it produced keywords like
    // "a baseline" from "Opening a baseline" — a phrase that is a literal
    // substring of almost any baseline question, so that page outscored the one
    // that actually answered "how do I create a baseline".
    const object = verbMatch[2].replace(ARTICLE_RE, '').trim();
    if (object) {
      const objectSingular = singular(object);
      [object, objectSingular].forEach((o) => {
        out.add(`${base} ${o}`);
        out.add(`how to ${base} ${o}`);
        out.add(`how do i ${base} ${o}`);
      });
    }
    out.add(`how to ${title}`);
    out.add(`how do i ${title}`);
  }
  if (page.steps.length) {
    out.add(`${title} steps`);
    out.add(`${title} procedure`);
  }
  // A one-word keyword is already covered by the word split above, and a bare
  // article fragment is noise — neither earns a phrase-weighted slot.
  return [...out]
    .map((k) => k.trim())
    .filter((k) => k && k.length > 3 && !ARTICLE_RE.test(k))
    .slice(0, 40);
}

// Copilot4DevOps is a separate product that plugs into Modern Requirements
// rather than a part of either MR generation, and it has its own user guide
// covering these same topics. Tagging its pages 'nextgen' just because they
// happen to be bound into the NextGen help set made Nexis stop and ask "MR 1.0
// or MR 2.0?" before answering questions about Elicit or Mockup, where the
// generation makes no difference to the answer.
const PRODUCT_LEVEL_MODULES = new Set(['Copilot4DevOps']);
const generationFor = (moduleName) => (PRODUCT_LEVEL_MODULES.has(moduleName) ? 'both' : 'nextgen');

// The page, rendered as the entry body. Sections appear only when the page has
// the corresponding content.
function composeAnswer(page, moduleName, parentTitle) {
  const parts = [];
  const under = parentTitle && parentTitle !== moduleName ? ' — under "' + parentTitle + '"' : '';
  if (generationFor(moduleName) === 'both') {
    // Provenance still stated: it is the NextGen help that documents this, even
    // though what it documents is not generation-specific.
    parts.push(`(${moduleName} — documented in the MR NextGen help${under})`);
  } else if (moduleName && moduleName !== page.title) {
    parts.push(`(${moduleName} module, MR 2.0 / NextGen${under})`);
  } else {
    parts.push('(MR 2.0 / NextGen)');
  }
  // Rendered in the page's own order so a procedure reads the way it was
  // written: the lead-in first, each step numbered as the source numbers it,
  // and every note left attached to the step it qualifies.
  const lines = [];
  let inSteps = false;
  page.blocks.forEach((b) => {
    if (b.kind === 'step') {
      if (!inSteps) { lines.push(''); lines.push('Steps:'); inSteps = true; }
      lines.push(`${b.n}. ${b.text}`);
      return;
    }
    if (b.kind === 'note') {
      // Indented rather than pulled into a section of its own — it belongs to
      // whatever precedes it.
      lines.push(`   ${b.label ? b.label.replace(/^./, (c) => c.toUpperCase()) : 'Note'}: ${b.text}`);
      return;
    }
    if (b.kind === 'bullet') { lines.push(`• ${b.text}`); return; }
    // Prose appearing partway through a procedure is commentary on it (what the
    // UI does between two clicks), so it stays inline rather than restarting
    // the step list.
    lines.push(inSteps ? `   ${b.text}` : b.text);
  });
  parts.push(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim());
  return parts.join('\n\n').trim();
}

function build() {
  const pages = parseAll(DIR).filter((p) => p.fileName.toLowerCase() !== 'index.htm');

  // The TOC hierarchy: a page whose topic path is "5" is the Smart Docs module
  // itself; "5.0_2" and "5.2" are pages belonging to it.
  const byTopic = new Map();
  pages.forEach((p) => { if (p.topicPath) byTopic.set(p.topicPath, p); });
  const moduleOf = (topicPath) => {
    if (!topicPath) return null;
    const root = topicPath.split('.')[0];
    const m = byTopic.get(root);
    return m ? m.title : null;
  };
  const parentOf = (topicPath) => {
    if (!topicPath || !topicPath.includes('.')) return null;
    const parent = topicPath.split('.').slice(0, -1).join('.');
    const p = byTopic.get(parent);
    return p ? p.title : null;
  };

  const entries = pages.map((p) => {
    const moduleName = moduleOf(p.topicPath);
    const parentTitle = parentOf(p.topicPath);
    return {
      id: 'ngh-' + slug(p.fileName),
      title: p.title,
      sourceDoc: SOURCE_DOC,
      page: 0,
      generation: generationFor(moduleName),
      keywords: deriveKeywords(p, moduleName),
      answer: composeAnswer(p, moduleName, parentTitle),
      _topicPath: p.topicPath,
      _module: moduleName,
      _file: p.fileName,
      _words: p.wordCount,
      _steps: p.steps.length
    };
  });

  // Related entries: the module a page belongs to, plus its siblings under the
  // same parent. Straight out of the help's own structure — no inference.
  const byId = new Map(entries.map((e) => [e.id, e]));
  const idForTopic = new Map();
  entries.forEach((e) => { if (e._topicPath) idForTopic.set(e._topicPath, e.id); });
  entries.forEach((e) => {
    const rel = new Set();
    if (e._topicPath) {
      const root = e._topicPath.split('.')[0];
      if (idForTopic.has(root) && idForTopic.get(root) !== e.id) rel.add(idForTopic.get(root));
      const parent = e._topicPath.includes('.') ? e._topicPath.split('.').slice(0, -1).join('.') : null;
      if (parent && idForTopic.has(parent)) rel.add(idForTopic.get(parent));
      entries.forEach((o) => {
        if (o.id === e.id || !o._topicPath) return;
        const oParent = o._topicPath.includes('.') ? o._topicPath.split('.').slice(0, -1).join('.') : null;
        if (parent && oParent === parent) rel.add(o.id);
      });
    }
    e.relatedIds = [...rel].slice(0, 12);
  });

  return { pages, entries, byId };
}

function main() {
  const { entries } = build();
  const selected = LIMIT ? entries.slice(0, LIMIT) : entries;

  const thin = selected.filter((e) => e._words < 25);
  console.log(`Parsed ${entries.length} help topics from ${path.resolve(DIR)}`);
  console.log(`  with numbered steps : ${selected.filter((e) => e._steps > 0).length}`);
  console.log(`  thin (<25 words)    : ${thin.length}${thin.length ? ' -> ' + thin.map((e) => e._file).join(', ') : ''}`);
  const modules = [...new Set(selected.map((e) => e._module).filter(Boolean))];
  console.log(`  modules             : ${modules.length} (${modules.join(', ')})`);

  if (DRY_RUN) {
    console.log('\n--- dry run, nothing written. Sample entry: ---');
    const sample = selected.find((e) => e._steps > 0) || selected[0];
    console.log(JSON.stringify({ id: sample.id, title: sample.title, generation: sample.generation, keywords: sample.keywords.slice(0, 8), relatedIds: sample.relatedIds, answer: sample.answer }, null, 2));
    return;
  }

  // Re-runnable: an entry already imported from this source is replaced rather
  // than duplicated, so fixing the parser and re-running is safe.
  //
  // Written straight through the shared db handle rather than via addKbEntry:
  // that helper re-exports the whole ~320KB kb.json after every single insert,
  // which at this volume means 256 rewrites of the same file inside one
  // transaction. The mirror is regenerated once at the end instead.
  const existing = new Set(kbStore.getKb().filter((e) => e.sourceDoc === SOURCE_DOC).map((e) => e.id));
  let added = 0; let replaced = 0;
  const db = kbStore.db;
  const upsert = db.prepare(`
    INSERT INTO kb_entries (id, title, sourceDoc, page, keywords, answer, generation, relatedIds)
    VALUES (@id, @title, @sourceDoc, @page, @keywords, @answer, @generation, @relatedIds)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, sourceDoc = excluded.sourceDoc, page = excluded.page,
      keywords = excluded.keywords, answer = excluded.answer,
      generation = excluded.generation, relatedIds = excluded.relatedIds
  `);
  const run = db.transaction((rows) => {
    rows.forEach((e) => {
      if (existing.has(e.id)) replaced++; else added++;
      upsert.run({
        id: e.id, title: e.title, sourceDoc: e.sourceDoc, page: e.page,
        keywords: JSON.stringify(e.keywords), answer: e.answer,
        generation: e.generation, relatedIds: JSON.stringify(e.relatedIds)
      });
    });
  });
  run(selected);
  kbStore.exportKbJson();
  console.log(`\nWrote ${selected.length} entries (${added} new, ${replaced} replaced). Mirror data/kb.json regenerated.`);
  // The engine caches its retrieval index and only rebuilds it when the entry
  // COUNT changes (or when server.js invalidates it after its own KB writes).
  // A re-run that replaces entries in place leaves the count identical, so a
  // server started before this ran will keep answering from the old text.
  if (replaced) {
    console.log('Restart the server to pick these up — replacing entries leaves the entry count unchanged, so a running instance will not rebuild its cached index on its own.');
  }
}

if (require.main === module) main();
module.exports = { build };
