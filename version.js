// MR Nexis — version and build registry.
//
// Format: Major.Minor.Patch.Build
//
//   Major  Major product release or significant architectural change
//   Minor  New feature, significant enhancement, or major functionality added
//   Patch  Bug fix, correction, or small improvement
//   Build  Incremented for EVERY deployable build, without exception
//
// The build number is the identifier that matters operationally: it is what a
// customer reads back, and what a reported issue is correlated against. It is
// therefore monotonic and never reused — a build number identifies one exact
// set of bytes, forever. Major/Minor/Patch describe the change; Build
// identifies the artifact.
//
// This file is the single source of truth. package.json carries the same
// version string, and a start-up check (see assertVersionsAgree) fails loudly
// if the two ever drift apart, because a version number nobody trusts is worse
// than none at all.

const BUILDS = [
  {
    build: '1.0.0.100',
    date: '2026-09-22',
    type: 'Release',
    changes: [
      'Initial MR Nexis support workspace: chat UI, login, and conversation history.',
      'SQLite persistence for the knowledge base, tickets, and the learning log.',
      'Document library with full-text search over uploaded documents and past tickets.',
      'Document-grounded answering engine with honesty gating (no confident answer without supporting documentation).'
    ],
    reference: '—',
    developer: 'Siraj Nazir',
    qa: 'Passed',
    deployment: 'Deployed'
  },
  {
    build: '1.1.0.101',
    date: '2026-09-24',
    type: 'Feature',
    changes: [
      'Product generation separation: every KB entry is tagged nextgen / legacy / both, derived from its source document.',
      'Retrieval excludes the generation the customer is not on, rather than ranking it down.',
      'Version gate: procedural questions ask "MR 1.0 (Legacy) or MR 2.0 (NextGen)?" before answering when the generation is unknown.',
      'Generation inferred from NextGen-only feature names, from earlier turns in the thread, or from the account profile.',
      'LLM path made generation-aware via a WHICH GENERATION context block and per-excerpt generation labels.',
      'Feature relationships (relatedIds) stored from the source documentation’s own structure.'
    ],
    reference: 'Version separation requirement',
    developer: 'Siraj Nazir',
    qa: 'Passed — 20/20 scenarios',
    deployment: 'Deployed'
  },
  {
    build: '1.1.1.102',
    date: '2026-09-24',
    type: 'Bug fix',
    changes: [
      'Fixed: source tiers gave NextGen a blanket ranking bonus for every customer, steering legacy users toward NextGen documentation.',
      'Fixed: any message of six words or fewer was treated as a follow-up, so "what is Smart Docs" got a clarifying question instead of an answer.',
      'Fixed: keyword matching was article-sensitive, so "create a baseline" could not match the keyword "create baselines".',
      'Fixed: generated keywords included article fragments such as "a baseline", which outscored the page that actually answered the question.',
      'Fixed: the help parser re-grouped page content, which reordered procedures and detached notes from the steps they qualify.'
    ],
    reference: 'Found during scenario testing',
    developer: 'Siraj Nazir',
    qa: 'Passed — 196-page regression, 0 false refusals',
    deployment: 'Deployed'
  },
  {
    build: '1.1.2.103',
    date: '2026-09-25',
    type: 'Bug fix',
    changes: [
      'Fixed: the version gate ran before the honesty check, so an undocumented question was asked "which generation?" before Nexis admitted it had no answer.',
      'Fixed: weak-evidence detection required a zero keyword score, which a question naming a module could never produce — an undocumented question returned thirteen unrelated steps marked confident.',
      'Fixed: the module name was a keyword on every page in that module, so all 34 Smart Docs pages tied and the overview lost on an alphabetical tie-break.',
      'Added: filenames contribute keywords, so a module titled "Review" is still found by "review management".'
    ],
    reference: 'Found during scenario testing',
    developer: 'Siraj Nazir',
    qa: 'Passed — 20/20 scenarios',
    deployment: 'Deployed'
  },
  {
    build: '1.2.0.104',
    date: '2026-09-25',
    type: 'Feature',
    changes: [
      'Knowledge base extended with the MR NextGen 2026 Release Notes, the Frontier Product Overview, and the NextGen On-Premises Installation Guide (35 curated entries, 3 source documents loaded for full-text search).',
      'Comparison and migration questions are now answered across both generations — the documented exception to keeping them apart.',
      'Feature-location questions ("where is Simulation?") answer from the deprecation map instead of asking which generation the customer is on.',
      'Corrected: four entries claimed NextGen had removed MongoDB entirely. That holds only for the cloud build; the on-premises installer still installs MongoDB.',
      'Fixed: camelCase product names were split during normalisation, so "NextGen" and "MongoDB" typed correctly matched nothing.',
      'Fixed: apostrophes split words, so "why don’t I see Use Case" could not match the entry written to answer it.'
    ],
    reference: 'Version-aware knowledge requirement',
    developer: 'Siraj Nazir',
    qa: 'Passed — 32/32 scenarios',
    deployment: 'Deployed'
  },
  {
    build: '1.3.0.105',
    date: '2026-09-25',
    type: 'Feature',
    changes: [
      'Added version and build management: Major.Minor.Patch.Build, with a build history recording date, change type, changes, reference, developer, QA status and deployment status.',
      'Current build shown in the sidebar and in Settings → About.',
      'GET /api/version exposes the current build and full history.',
      'Start-up check fails the boot if version.js and package.json disagree.'
    ],
    reference: 'Version & build management requirement',
    developer: 'Siraj Nazir',
    qa: 'Passed',
    deployment: 'Deployed'
  },
  {
    build: '1.3.1.106',
    date: '2026-09-25',
    type: 'Bug fix',
    changes: [
      'Fixed: the feature-location bypass let ordinary procedural questions skip the version gate. "How do I configure the deprecated field setting" was answered from NextGen material and "where is the New Baseline button" from legacy material, in both cases without establishing the generation. The bypass was also redundant — version-independent material is already recognised by its tag.',
      'Fixed: /api/version read and parsed the whole knowledge base to report a count, on an unauthenticated endpoint. Added countKb().',
      'Fixed: the About panel left a loading placeholder on screen when the version request failed.',
      'Removed two no-op entries from the term-rejoining map.'
    ],
    reference: 'Self-review of builds 1.1.0.101–1.3.0.105',
    developer: 'Siraj Nazir',
    qa: 'Passed — 32/32 scenarios + gate-leak regression',
    deployment: 'Deployed'
  },
  {
    build: '1.3.2.107',
    date: '2026-09-25',
    type: 'Bug fix',
    changes: [
      'Fixed: the chat pane grew past the bottom of the window instead of scrolling, pushing the message box off screen on any conversation longer than a few turns. .main is a grid item, and a grid item defaults to min-height: auto, so it stretched to fit its content rather than being capped at the window height.',
      'Fixed as a consequence: auto-scroll to the newest message, which had been a no-op because the message list was never a real scroll container.'
    ],
    reference: 'Reported from the running app',
    developer: 'Siraj Nazir',
    qa: 'Passed — layout verified at 1280x760',
    deployment: 'Deployed'
  }
];

// The newest entry is the current build. Derived rather than declared
// separately, so the two can never disagree.
const CURRENT = BUILDS[BUILDS.length - 1];

const parse = (b) => b.split('.').map(Number);

// Guards against the two mistakes this scheme exists to prevent: a reused build
// number, and a build number that goes backwards. Both would break the promise
// that a build number identifies exactly one artifact.
function assertHistoryIsSane() {
  const seen = new Set();
  let previous = null;
  for (const b of BUILDS) {
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(b.build)) {
      throw new Error(`Malformed build number: ${b.build}`);
    }
    if (seen.has(b.build)) {
      throw new Error(`Duplicate build number: ${b.build}. Build numbers are never reused.`);
    }
    seen.add(b.build);
    const n = parse(b.build)[3];
    if (previous !== null && n <= previous) {
      throw new Error(`Build number ${b.build} does not increase on the previous build (${previous}).`);
    }
    previous = n;
  }
}

// package.json is what npm and any packaging step read; version.js is what the
// application reports. If they drift, a customer quotes one number and the team
// looks at another.
function assertVersionsAgree() {
  const pkg = require('./package.json');
  const expected = parse(CURRENT.build).slice(0, 3).join('.');
  if (pkg.version !== expected) {
    throw new Error(
      `Version mismatch: package.json says ${pkg.version}, current build ${CURRENT.build} implies ${expected}. ` +
      'Update package.json to match, or add the missing build to version.js.'
    );
  }
}

assertHistoryIsSane();

module.exports = {
  version: CURRENT.build,
  semantic: parse(CURRENT.build).slice(0, 3).join('.'),
  buildNumber: parse(CURRENT.build)[3],
  releaseDate: CURRENT.date,
  current: CURRENT,
  builds: BUILDS,
  assertVersionsAgree,
  assertHistoryIsSane
};
