// Loads whole PDF/DOCX source documents into the documents table so their full
// text is searchable through the FTS fallback.
//
//   node tools/ingest-pdf-docs.js
//
// This is deliberately NOT curated-KB ingestion. It extracts text verbatim and
// stores it; nothing is summarised, rewritten, or turned into an answer. The
// curated kb_entries are written separately (see seed-nextgen-kb.js), because a
// KB entry asserts something as documented fact and that judgement should not
// be made by a text splitter.

const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const kbStore = require('../db');

// Each source is declared with the generation it documents, so that anything
// built on top of this text inherits the right one rather than guessing.
const SOURCES = [
  {
    file: 'F:/Clients - Logs & Recordings/II/1.13.1.5/Modern Requirement4DevOps NextGen 2026 Release Notes 2.pdf',
    name: 'MR NextGen 2026 Release Notes (v1.13.1.3, Aug 2026)',
    generation: 'nextgen'
  },
  {
    file: 'F:/Clients - Logs & Recordings/II/1.13.1.5/MR_Frontier_Product_Overview.pdf',
    name: 'MR4DevOps Frontier Product Overview (2026 Edition)',
    generation: 'nextgen'
  },
  {
    file: 'F:/Clients - Logs & Recordings/II/1.13.1.5/Modern Requirements4DevOps InstallationGuide.pdf',
    name: 'MR NextGen On-Premises Installation Guide (v1.0, Sep 2026)',
    generation: 'nextgen'
  }
];

// The page furniture repeats on all ~150 pages and would otherwise dominate any
// full-text match on common words.
function stripFurniture(text) {
  return text
    .split('\n')
    .filter((line) => {
      const l = line.trim();
      if (!l) return false;
      if (/^©\s*20\d\d Modern Requirements/i.test(l)) return false;
      if (/^Page \d+ of \d+$/i.test(l)) return false;
      if (/^www\.modernrequirements\.com$/i.test(l)) return false;
      if (/^Modern Requirements4DevOps Installation Guide$/i.test(l)) return false;
      if (/^MR4DevOps Frontier · Confidential$/i.test(l)) return false;
      if (/^Modern Requirements Frontier· Product Overview$/i.test(l)) return false;
      return true;
    })
    .join('\n');
}

async function main() {
  const existing = new Set(kbStore.listDocuments().map((d) => d.fileName));
  for (const src of SOURCES) {
    if (!fs.existsSync(src.file)) {
      console.log('SKIP (not found): ' + src.file);
      continue;
    }
    if (existing.has(src.name)) {
      console.log('SKIP (already loaded): ' + src.name);
      continue;
    }
    const data = await pdf(fs.readFileSync(src.file));
    const text = stripFurniture(data.text);
    // The generation is written into the stored text rather than a column,
    // because documents are raw source material and every excerpt pulled out of
    // one needs to carry which product it describes.
    const header = `[${src.name} — documents ${src.generation === 'nextgen' ? 'MR 2.0 / NextGen' : 'MR 1.0 / Legacy'}]\n\n`;
    const doc = kbStore.createDocument(src.name, 'application/pdf', header + text);
    console.log(`Loaded  ${String(data.numpages).padStart(3)}pp  ${String(text.length).padStart(7)} chars  -> doc #${doc.id}  ${src.name}`);
  }
  console.log('\nDocuments now in library:');
  kbStore.listDocuments().forEach((d) => console.log(`  #${d.id}  ${d.fileName}`));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
