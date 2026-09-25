// Parser for the Modern Requirements NextGen online help export (Adobe
// RoboHelp 2019 output, 257 .htm topics).
//
// Deliberately a pure parser: it reads pages and reports what is actually on
// them. It never composes prose, never fills a missing prerequisite or
// limitation from inference, and never merges two topics into one narrative.
// Whatever a page does not say comes back empty, so the gap stays visible
// instead of being papered over downstream.
//
// Structure comes from two things the export already carries:
//   * gTopicId ("14.1.2_2") — the topic's position in the help TOC, which is
//     how a feature is related to its parent module and its siblings.
//   * the page's own numbered/bulleted lists and "Note:" callouts.

const fs = require('fs');
const path = require('path');

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'",
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  mdash: '—', ndash: '–', hellip: '…', reg: '®',
  trade: '™', copy: '©', deg: '°', times: '×', bull: '•'
};
function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-z0-9#]+);/gi, (m, name) => {
      const k = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(ENTITIES, k) ? ENTITIES[k] : m;
    });
}

// The footer and RoboHelp's bootstrap script are on every page; keeping them
// would put "© 2026 Modern Requirements" into the body of 257 KB entries.
const BOILERPLATE_START = /(?:\n\s*Modern Requirements\s*\n\s*©|\/\/<!\[CDATA\[|©\s*20\d\d Modern Requirements)/;

function visibleText(html) {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<head\b[\s\S]*?<\/head>/gi, ' ');
  // Block-level tags become line breaks so list items and paragraphs don't run
  // together into one unreadable line.
  s = s.replace(/<\s*(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/td)\b[^>]*>/gi, '\n');
  s = s.replace(/<\s*(li)\b[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  const cut = s.search(BOILERPLATE_START);
  if (cut > 0) s = s.slice(0, cut);
  return s
    .split('\n')
    .map((l) => l.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

const firstMatch = (html, re) => { const m = html.match(re); return m ? decodeEntities(m[1]).trim() : null; };

// A numbered step ("3. Select the desired Area path") or a bullet. Captured
// separately from prose because a procedure is the part that must survive
// intact — reflowing steps into a paragraph is how an ordering gets lost.
const STEP_RE = /^\s*(\d+)[.)]\s+(.*)$/;
const BULLET_RE = /^\s*[••\-–]\s*(.*)$/;
const NOTE_RE = /^\s*(note|important|caution|warning|tip)\s*[:.-]\s*(.*)$/i;

function parsePage(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  const title = firstMatch(html, /<title>([\s\S]*?)<\/title>/i) || fileName.replace(/\.htm$/, '').replace(/_/g, ' ');
  const topicId = firstMatch(html, /gTopicId\s*=\s*"([^"]+)"/);
  const text = visibleText(html);

  const lines = text.split('\n');
  // The page title is repeated as the first visible heading on every topic.
  const body = lines.length && lines[0].trim().toLowerCase() === title.trim().toLowerCase()
    ? lines.slice(1) : lines;

  // Classified IN PLACE, never re-grouped. A help topic interleaves its steps
  // with the prose and notes that belong to them — "The Add Work Item pop up is
  // now shown" sits between steps 2 and 3, and a Note: line qualifies the step
  // directly above it. Sorting those into separate prose/steps/notes lists and
  // reassembling produced an entry that opened mid-procedure and moved every
  // caveat to the end, away from the step it warned about. So `blocks` keeps the
  // page's own order and is what gets rendered; the flat lists below are
  // derived views, used for keyword generation and for "does this page document
  // a procedure at all".
  const blocks = [];
  body.forEach((line) => {
    const note = line.match(NOTE_RE);
    if (note) { blocks.push({ kind: 'note', text: note[2].trim(), label: note[1] }); return; }
    const step = line.match(STEP_RE);
    if (step) { blocks.push({ kind: 'step', n: Number(step[1]), text: step[2].trim() }); return; }
    const bullet = line.match(BULLET_RE);
    if (bullet) { blocks.push({ kind: 'bullet', text: bullet[1].trim() }); return; }
    blocks.push({ kind: 'prose', text: line });
  });

  const of = (kind) => blocks.filter((b) => b.kind === kind);
  const steps = of('step').map((b) => ({ n: b.n, text: b.text }));
  const notes = of('note').map((b) => b.text);
  const bullets = of('bullet').map((b) => b.text);
  const prose = of('prose').map((b) => b.text);

  return {
    fileName,
    topicId,
    blocks,
    // "_2" on a topic id is RoboHelp's disambiguator for two topics at the same
    // TOC position, not another level of nesting.
    topicPath: topicId ? topicId.replace(/_\d+$/, '') : null,
    title,
    text,
    prose,
    steps,
    bullets,
    notes,
    wordCount: text.split(/\s+/).filter(Boolean).length
  };
}

function parseAll(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.htm'))
    .map((f) => parsePage(path.join(dir, f)));
}

module.exports = { parsePage, parseAll, visibleText, decodeEntities };
