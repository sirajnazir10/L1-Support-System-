// Corrects four legacy KB entries that asserted, as settled fact, that NextGen
// has no MongoDB to install because Cosmos DB replaced it.
//
// That is true only of the cloud/SaaS deployment. The NextGen On-Premises
// Installation Guide installs MongoDB as a dedicated Windows service
// (MongoDB_MRNextGen, database ModernReq4DevOps), so an on-premises customer
// told "there's no MongoDB to install or configure" is being walked away from a
// step their install actually requires.
//
// The migration notes are rewritten rather than deleted: the "what changed in
// NextGen" pointer on a legacy entry is genuinely useful, it was only the claim
// inside it that was wrong.
//
//   node tools/fix-nextgen-datastore-claims.js [--dry-run]

const kbStore = require('../db');

const CORRECTED_NOTE = `Note: this describes the legacy on-premise (Classic) installer. In MR 2.0 / NextGen the data store depends on the deployment: the cloud/SaaS build uses Azure Cosmos DB on Azure App Service, while the NextGen ON-PREMISES installer still bundles and installs MongoDB as a dedicated Windows service (MongoDB_MRNextGen, database ModernReq4DevOps). Do not tell an on-premises NextGen customer there is no MongoDB to configure. See "What database NextGen uses — Cosmos DB (cloud) vs MongoDB (on-premises)".`;

// Each fix replaces the sentence(s) making the incorrect universal claim.
// Matched on a distinctive fragment so an already-corrected entry is left alone.
const FIXES = [
  {
    id: 'install-mongodb',
    wrong: /Note: this describes the legacy on-premise \(Classic\) installer\. In MR4DevOps NextGen \(released June 2026\), MongoDB has been replaced by Azure Cosmos DB as the managed primary data store — there'?s no MongoDB to install or configure\.[^\n]*/,
    right: CORRECTED_NOTE
  },
  {
    id: 'install-redis-hw',
    wrong: /In MR4DevOps NextGen \(released June 2026\), MongoDB was replaced by Azure Cosmos DB as the managed primary data store, and the platform runs on Azure App Service[^.]*\./,
    right: `In MR 2.0 / NextGen, the cloud/SaaS build runs on Azure App Service with Azure Cosmos DB and has no self-hosted Redis or MongoDB to size. The NextGen on-premises build does still install MongoDB locally (see the NextGen on-premises system requirements entry); Redis is not listed among its prerequisites.`
  },
  {
    id: 'install-redis-cfg',
    wrong: /In MR4DevOps NextGen \(released June 2026\), the platform runs on Azure App Service with Azure Cosmos DB as the managed data store, so there'?s no self-hosted Redis to confi[^.]*\./,
    right: `In MR 2.0 / NextGen, Redis is not listed as a prerequisite in either the cloud or the on-premises documentation, so there is no self-hosted Redis to configure. Note that the NextGen on-premises installer does still install MongoDB — only Redis has gone.`
  },
  {
    id: 'install-install-steps',
    wrong: /In MR4DevOps NextGen \(released June 2026\), the platform is hosted on a managed Azure App Service with Azure Cosmos DB as its data store, so these local database installat[^.]*\./,
    right: `In MR 2.0 / NextGen these steps do not apply — NextGen has its own installer and its own sequence (see "Installing NextGen on-premises: the eight installer steps"). The cloud build is hosted on Azure App Service with Azure Cosmos DB and is not locally installed at all; the on-premises build has a different installer that sets up IIS on port 8025 and MongoDB.`
  }
];

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const db = kbStore.db;
  const get = db.prepare('SELECT id, title, answer FROM kb_entries WHERE id = ?');
  const set = db.prepare('UPDATE kb_entries SET answer = ? WHERE id = ?');

  let changed = 0; let skipped = 0;
  for (const fix of FIXES) {
    const row = get.get(fix.id);
    if (!row) { console.log(`MISSING  ${fix.id}`); continue; }
    if (!fix.wrong.test(row.answer)) {
      console.log(`SKIP     ${fix.id} — claim not found (already corrected?)`);
      skipped++;
      continue;
    }
    const updated = row.answer.replace(fix.wrong, fix.right);
    console.log(`FIX      ${fix.id} — ${row.title}`);
    if (!dryRun) { set.run(updated, fix.id); }
    changed++;
  }

  if (dryRun) { console.log(`\nDry run: ${changed} would change, ${skipped} skipped.`); return; }
  if (changed) kbStore.exportKbJson();
  console.log(`\nCorrected ${changed} entries, skipped ${skipped}. Mirror regenerated.`);
}

if (require.main === module) main();
