// Curated KB entries for MR 2.0 / NextGen, written from three official sources:
//
//   * MR NextGen 2026 Release Notes (v1.13.1.3, August 2026)
//   * MR4DevOps Frontier Product Overview (2026 Edition)
//   * MR NextGen On-Premises Installation Guide (v1.0, September 2026)
//
// Every entry states only what those documents state. Where the documents
// disagree with each other, the entry says so rather than silently picking a
// side — a support agent needs to know a fact is contested far more than they
// need a confident-sounding answer.
//
//   node tools/seed-nextgen-kb.js [--dry-run]

const kbStore = require('../db');

const RN = 'MR NextGen 2026 Release Notes';
const PO = 'MR4DevOps Frontier Product Overview';
const IG = 'MR NextGen On-Premises Installation Guide';

const entries = [

// ============================================================
//  Telling the two generations apart — the prerequisite for everything else
// ============================================================
{
  id: 'ng-which-generation-am-i-on',
  title: 'How to tell whether a customer is on MR 1.0 (Legacy/2025) or MR 2.0 (NextGen)',
  sourceDoc: RN, generation: 'both',
  keywords: ['which version am i on', 'which generation', 'how do i know if i am on nextgen', 'legacy or nextgen', 'mr 1.0 or mr 2.0', 'identify version', 'what version is the customer on', 'is this nextgen', 'is this legacy', 'mr 2025 or nextgen', 'tell which product', 'version check', 'build version', 'how to identify the version'],
  answer: `Ask before giving any procedural steps — the two are separate applications and the steps differ.

Fastest checks, in order of reliability:

1. Build version. Admin Panel / Organization Settings shows a "Build Version". NextGen 2026 builds read 1.x (e.g. 1.13.1.3, 1.10.1.0, 1.7.1.0). MR 2025 builds read 30.x (e.g. 30.5.1.3).
2. The product name shown in Organization Settings. NextGen shows "Modern Requirements4DevOps NextGen 2026". Legacy shows "Modern Requirements4DevOps 2025".
3. Features that exist only in NextGen: Smart Edit (a single window replacing Smart View + Smart Editor), Smart Import as its own module, the Review Dashboard, Traceability Tree View / Link Tree View / Heatmap View / Analytics tab, the Favorites tab on Browse pages, and full ADO theme sync (dark mode).
4. Features that exist only in Legacy: Simulation, Use Case, FAQ, Smart Note, and MR's own Impact Assessment module — all removed in NextGen (see the deprecated-functions entry).
5. On-premises: NextGen serves on IIS port 8025 with a site named "Modern Requirements4DevOps NextGen". Legacy does not.

If the customer can't tell you, ask them to open Azure DevOps > Organization Settings > Modern Requirements4DevOps and read the build version back.`
},

{
  id: 'ng-what-changed-2025-to-nextgen',
  title: 'What changed between MR 2025 and MR NextGen — the summary',
  sourceDoc: RN, generation: 'both',
  keywords: ['what changed from mr 2025 to nextgen', 'what changed from 2025 to nextgen', 'what changed in nextgen', 'what is new in nextgen', 'whats new', 'difference between 2025 and nextgen', 'mr 2025 vs nextgen', 'legacy vs nextgen', 'compare 2025 and nextgen', 'this worked in mr 2025', 'why is it different now', 'release highlights', 'summary of changes', 'what is different in nextgen', 'changes in nextgen', 'nextgen release summary'],
  answer: `(Comparison across generations — MR 2025 -> MR 2.0 / NextGen)

The six headline changes from the Release Notes:

1. Modernized architecture — rebuilt on the latest technology stack. MR 1.0 was ASP.NET MVC + WCF REST on an Azure VM; NextGen is React + ASP.NET Core Web API on Azure App Service.
2. Refreshed UI — visual and interaction patterns now align with the latest Azure DevOps experience, including full ADO theme sync (dark mode) and responsive design.
3. Fully scalable — Azure App auto-scaling out of the box, scaling horizontally with demand.
4. Significant reliability improvements — 90%+ of known bugs from MR 2025 have been resolved.
5. Enhanced functions — many existing capabilities expanded (see the per-module enhancement entries for Smart Report, Smart Docs, Review, Trace Analysis, Baseline and Version Package).
6. Streamlined function set — functions now better served by Copilot4DevOps have been deprecated.

The changes customers notice first, driven by direct feedback:
- Smart Docs gains a Hierarchy View for clearer document navigation
- Version Package gains side-by-side version comparison for faster change analysis
- Review gains threaded comments, similar to the MS Word experience
- Review gains fully automated closure that runs in the background without any user logged in

Things that are gone or moved: Simulation, Use Case, FAQ, Smart Note and MR's Impact Assessment were removed — see the deprecated-functions entry for where each went. Smart View and Smart Editor merged into Smart Edit. Word Import became the Smart Import module. "Create Request" is now "Send for Review". Reporting is not in this release and returns in the next one.

Compatibility change worth raising early: MR 2025 supported Azure DevOps 2019; NextGen requires Azure DevOps Server 2022 or later.

And the caveat to give every customer asking about moving: migration compatibility for existing MR 2025 data is still under analysis, and Modern Requirements recommends not upgrading production until the data compatibility guide is published.`
},

// ============================================================
//  Architecture and deployment — including the data-store correction
// ============================================================
{
  id: 'ng-architecture-vs-legacy',
  title: 'NextGen architecture and how it differs from MR 1.0',
  sourceDoc: RN, generation: 'nextgen',
  keywords: ['nextgen architecture', 'what changed architecture', 'technology stack', 're-architecture', 'rebuilt platform', 'asp.net core', 'react frontend', 'azure app service', 'wcf', 'mvc', 'why is nextgen faster', 'what is nextgen built on', 'platform modernization'],
  answer: `(MR 2.0 / NextGen)

NextGen is a full re-architecture, not an incremental update.

MR 1.0 was an ASP.NET MVC UI with WCF REST services hosted on an Azure VM.

NextGen uses:
- Frontend: React (Azure DevOps Extension UI)
- Backend service: ASP.NET Core Web API
- Hosting: Azure App Service (managed, cloud-native)
- Azure DevOps auth: Extension scope OAuth
- Primary data store: see the separate data-store entry — it differs between cloud and on-premises

What it keeps from MR 1.0: the integration pattern with Azure DevOps via OAuth, and a document-oriented persistence model.

Consequences the customer will notice: faster page loads on large work item sets and traceability views, fewer timeouts under load, Azure App auto-scaling with no manual capacity planning, and more predictable performance as data volume grows.`
},
{
  id: 'ng-data-store-cloud-vs-onprem',
  title: 'What database NextGen uses — Cosmos DB (cloud) vs MongoDB (on-premises)',
  sourceDoc: IG, generation: 'nextgen',
  keywords: ['nextgen database', 'does nextgen use mongodb', 'cosmos db', 'mongodb nextgen', 'what database does nextgen use', 'data store', 'is mongodb still needed', 'database requirement', 'primary data store', 'nextgen data storage', 'no mongodb', 'does nextgen still use mongodb', 'nextgen still use mongodb', 'is mongodb required', 'mongodb or cosmos', 'which database', 'database for nextgen'],
  answer: `(MR 2.0 / NextGen)

This depends entirely on how NextGen is deployed, and it is the single most common source of wrong answers here.

On-premises NextGen DOES use MongoDB. The On-Premises Installation Guide is explicit: the installer bundles and installs MongoDB as a dedicated Windows service (MongoDB_MRNextGen), the database is named ModernReq4DevOps, and the default MongoDB port is 27017. You can also point it at an existing MongoDB instead. So "NextGen removed MongoDB" is wrong for any on-premises customer.

Cloud/SaaS NextGen uses Azure Cosmos DB. The Release Notes technology table lists "Primary Data Store: Azure Cosmos DB" alongside Azure App Service hosting.

A conflict worth knowing about, because the official documents do not agree:
- The Release Notes technology table says Azure Cosmos DB.
- The same Release Notes' architecture prose says NextGen keeps "the document-oriented persistence model in MongoDB".
- The Release Notes on-premises prerequisites table says MongoDB 7.0 (recommended) / 6.0.
- The On-Premises Installation Guide says MongoDB 8.2.5.

So the MongoDB version required on-premises is stated differently in the two documents (7.0/6.0 vs 8.2.5). Confirm against the installer build the customer actually has before quoting a version number — do not state one as settled.`
},
{
  id: 'ng-onprem-system-requirements',
  title: 'NextGen on-premises system requirements',
  sourceDoc: IG, generation: 'nextgen',
  keywords: ['nextgen system requirements', 'on premise requirements', 'what do i need to install nextgen', 'prerequisites nextgen', 'supported operating system nextgen', 'disk space', 'windows server', 'port 8025', 'nextgen server requirements', 'hardware requirements nextgen'],
  answer: `(MR 2.0 / NextGen — on-premises)

From the On-Premises Installation Guide:

- Operating system: Windows Server 2019 or 2022 (Windows 10/11 supported for evaluation only)
- Azure DevOps Server: 2022 and later
- Disk space: ~2 GB free during installation (application, MongoDB, .NET hosting bundle)
- Network port: TCP 8025 available for the website — the installer opens it in Windows Firewall automatically
- Database: MongoDB 8.2.5, installed automatically, or an existing MongoDB you connect to

Bundled inside the installer (each installed only if not already present):
- ASP.NET Core 10.0 Hosting Bundle (x64) — the .NET runtime plus the IIS integration module
- MongoDB 8.2.5 — installed as a dedicated Windows service when you choose the default local database option

The installer is signed and self-contained, so the target machine does not need internet access during installation. The application files and the Extension Maker utility ship and install separately.

All steps require local administrator rights.

Note: the Release Notes state the on-premises prerequisites slightly differently (MongoDB 7.0/6.0, .NET 10 runtime, IIS Web Server role with WebSockets, URL Rewrite and Application Initialization). Where the two disagree, the Installation Guide is the more specific source for an actual install.`
},
{
  id: 'ng-onprem-install-steps',
  title: 'Installing NextGen on-premises: the eight installer steps',
  sourceDoc: IG, generation: 'nextgen',
  keywords: ['how do i install nextgen', 'install nextgen', 'nextgen installation steps', 'installation procedure', 'setup nextgen', 'run the installer', 'install on premise', 'installing nextgen server', 'how to install nextgen server'],
  answer: `(MR 2.0 / NextGen — on-premises)

Before you start: which of the three scenarios applies decides where you begin.
- New customer, no existing data: start at Step 1.
- Existing customer installing on a NEW server with no existing data there: start at Step 1.
- Existing customer installing on the SAME server with existing data: export your data FIRST with the MR Exporter. The guide warns that if the recommended sequence is not followed, existing data may be lost.

The overall sequence is: Export Data -> Installation -> Import Data -> use NextGen.

Steps:
1. Right-click "Modern Requirements4DevOps NextGen.exe" and choose Run as administrator. Approve the UAC prompt.
2. Welcome screen — click Next.
3. Read the End-User License Agreement, tick "I agree", click Next.
4. Choose the installation folder. Default: C:\\Program Files\\Modern Requirements\\Modern Requirements4DevOps NextGen\\
5. Configure the MongoDB connection (see the MongoDB connection entry). Click Install.
6. Prerequisites are installed — the installer checks for the ASP.NET Core Hosting Bundle and MongoDB and installs whichever is missing.
7. Installation progresses — application files are copied, the IIS website is created on port 8025, the firewall rule is added, and the MongoDB connection is written to configuration.
8. Finish — the wizard shows the application URL, http://<computer-name>:8025/. Click Run to open it, or Finish to close.`
},
{
  id: 'ng-mongodb-connection-config',
  title: 'Configuring the MongoDB connection during NextGen on-premises install',
  sourceDoc: IG, generation: 'nextgen',
  keywords: ['mongodb connection', 'connection string', 'appsettings.json', 'connect to existing mongodb', 'replica set', 'tls ssl mongodb', 'mongodb authentication', 'database connection nextgen', 'configure database', 'mongodb host port'],
  answer: `(MR 2.0 / NextGen — on-premises)

Step 5 of the installer decides where NextGen stores its data. Two paths:

Install a dedicated MongoDB (recommended): leave Host as localhost. The installer sets up MongoDB 8.2.5 as a dedicated service on the machine.

Use an existing MongoDB: enter the server name or address in Host, adjust Port if needed, optionally fill in a Replica set. Tick "Use TLS/SSL" for an encrypted connection, and tick "This server requires authentication" to enter a Username and Password.

What gets written, based on what you enter:
- Host localhost, no auth          -> mongodb://localhost:27017/
- Host 10.0.0.41, no auth          -> mongodb://10.0.0.41:27017/
- Host + username/password         -> mongodb://user:pass@10.0.0.41:27017/
- Plus Use TLS/SSL                 -> ...:27017/?tls=true
- Plus Replica set rs0             -> ...?replicaSet=rs0

The connection string is written automatically into the application's appsettings.json in the Database, Cache and Logging sections — you do not edit any config file by hand.

The database name is fixed to ModernReq4DevOps and is not configurable.

Config file location: C:\\Program Files\\Modern Requirements\\Modern Requirements4DevOps NextGen\\appsettings.json`
},
{
  id: 'ng-verify-installation',
  title: 'Verifying a NextGen on-premises installation',
  sourceDoc: IG, generation: 'nextgen',
  keywords: ['verify installation', 'is nextgen running', 'check installation', 'confirm nextgen installed', 'iis site check', 'mongodb service running', 'application is running', 'post install check', 'how do i know nextgen installed correctly'],
  answer: `(MR 2.0 / NextGen — on-premises)

Three checks:

1. Open the application. Browse to http://<computer-name>:8025/ from the server, or from another machine using the server's name or IP. A healthy server responds with: "ModernRequirements4DevOps v2(Build: v 1.10.1.0) application is running."
2. Check IIS. In IIS Manager there should be a website named "Modern Requirements4DevOps NextGen" bound to port 8025 and running. Its application pool is MRNextGen.
3. Check MongoDB. If you chose the dedicated install, the MongoDB_MRNextGen Windows service should be Running — check the Services console or run: sc.exe query MongoDB_MRNextGen

Note on HTTPS: the finish page shows an http:// address because the site is served over HTTP on port 8025 by default. To publish over HTTPS, add an HTTPS binding and certificate in IIS after installation.`
},
{
  id: 'ng-troubleshooting-install',
  title: 'NextGen on-premises installation troubleshooting',
  sourceDoc: IG, generation: 'nextgen',
  keywords: ['nextgen installation failed', 'cannot install mongodb', 'website does not open', 'port 8025 not working', 'cannot reach the database', 'installation troubleshooting', 'where are the logs', 'install error', 'older mongodb is present', 'site wont load'],
  answer: `(MR 2.0 / NextGen — on-premises)

"Cannot install MongoDB" — an older MongoDB is present.
The installer stops rather than risk your existing data. To proceed:
1. Back up your existing MongoDB data.
2. Uninstall the older MongoDB from Programs and Features.
3. If its Windows service remains, remove it from an elevated prompt:
   net stop MongoDB
   sc.exe delete MongoDB
4. Run the installer again.

The website does not open on port 8025.
- Confirm the "Modern Requirements4DevOps NextGen" site is started in IIS Manager.
- Check no other application is using port 8025.
- Confirm the inbound firewall rule for TCP 8025 exists (the installer adds it).

The application starts but cannot reach the database.
- Open appsettings.json in the install folder and confirm the connection string is correct.
- Confirm MongoDB is running and reachable — service running for a local install, or network/credentials correct for a remote one.

Where to find logs.
Windows Installer logs and the .NET hosting bundle log are written to the user's %TEMP% folder during installation. Application logs follow the app's configured logging target.`
},
{
  id: 'ng-repair-remove-upgrade',
  title: 'Repairing, removing, or upgrading NextGen on-premises',
  sourceDoc: IG, generation: 'nextgen',
  keywords: ['repair nextgen', 'uninstall nextgen', 'remove nextgen', 'upgrade nextgen', 'upgrade to newer version', 'reinstall', 'maintenance mode', 'already installed screen', 'how do i upgrade nextgen'],
  answer: `(MR 2.0 / NextGen — on-premises)

Repair or remove: run the installer again on a machine that already has NextGen. It opens in maintenance mode on the "Already installed" screen.
- Repair — reinstalls the application files, leaving your database untouched.
- Remove — uninstalls the application. You can also uninstall from Programs and Features.

Removing the application does NOT remove MongoDB or its data. Uninstall MongoDB separately from Programs and Features if you no longer need the database.

Upgrading to a newer version: run the newer installer. It detects the currently-installed version, removes it, and installs the new one in a single pass. Your MongoDB data is preserved.

Take a backup of your MongoDB data before installing a new version.`
},
{
  id: 'ng-post-install-iis-and-vsix',
  title: 'NextGen post-installation: IIS binding and building the ADO extension (VSIX)',
  sourceDoc: IG, generation: 'nextgen',
  keywords: ['extension maker', 'build vsix', 'deployment url', 'iis binding', 'https binding', 'upload extension', 'post installation configuration', 'vsix file', 'azure devops extension nextgen', 'install the extension', 'manage extensions'],
  answer: `(MR 2.0 / NextGen — on-premises)

1. Configure the IIS binding.
The installer publishes on port 8025. Before handing the server to users:
- Open IIS Manager, select the "Modern Requirements4DevOps NextGen" site.
- Actions pane > Bindings. Add or edit a binding with the host name (or IP) and port your clients will use.
- For a secure deployment, add an https binding and select the TLS/SSL certificate for that host.
- Apply the changes, then restart the site if prompted.

2. Verify the site is running on the new binding, from the server and from a client machine.

3. Create the extension (VSIX) with Extension Maker.
The Extension Maker utility ships with the installer and sits in the installation directory.
- Launch "Modern Requirements4DevOps Extension Maker".
- In Deployment URL, enter the binding address from step 1.
- Set the Version and any other required fields, then click Build VSIX.
- Upload the generated .vsix to Azure DevOps Server: Collection Settings > Extensions > Manage > Upload.

Critical: the Deployment URL must match the IIS binding — same host and same port. If they differ, Azure DevOps cannot reach the NextGen server.

Updating an existing extension: in Manage Extensions, right-click the Modern Requirements4DevOps extension and choose Update. That updates it across all DevOps collections at once, rather than one at a time.`
},
{
  id: 'ng-migration-exporter-importer',
  title: 'Migrating MR 2025 data to NextGen: MR Exporter and MR NextGen Importer',
  sourceDoc: IG, generation: 'both',
  keywords: ['migrate to nextgen', 'migration', 'mr exporter', 'nextgen importer', 'move data to nextgen', 'export legacy data', 'import data nextgen', 'upgrade from 2025 to nextgen', 'data migration', 'existing client install', 'stage 1 folder', 'manifest.json', 'how do i migrate'],
  answer: `(Applies across both generations — this is the MR 2025 -> NextGen migration path)

Two utilities, run in order. Export BEFORE installing the NextGen server on a machine that holds existing data.

Stage 1 — MR Exporter. Connects to your existing inteGREAT database and writes a structured, portable package of files. It never modifies the source system. Two tabs:

MongoDB tab (database records — documents, baselines, reviews, version packages, users, settings):
1. Open the MR Exporter, stay on the MongoDB tab.
2. Click Load. It connects to the legacy database automatically — server address and database name are pre-configured, nothing to type.
3. Choose scope: tick the Collections, Projects and Modules you want. The "none = all" rule applies — leave a list unticked and everything in it is included. Checking nothing at all exports the entire database (you are asked to confirm).
4. Optionally tick "Include DMS database" to also export the DMS document-management records. Your Projects selection applies to DMS too. Licensing records that belong to no project are always included. If there is no DMS database, the export notes it and continues. DMS file contents are NOT migrated — only database records.
5. Choose an empty output folder and click Export. A progress log, summary, and a manifest file recording exactly what was exported are produced.

Files (Public Documents) tab (supporting files on disk, e.g. templates, including Recycle Bin items):
1. Switch to the tab, set "Public Documents path" to the inteGREAT public-documents folder.
2. Tick categories to include (Templates, SmartReportTemplates, Settings, MR-Agent, ReqIF4DevOps, SmartWordTemplates, License...), or leave unticked for all.
3. Choose an output folder and Export. A reference.json plus the copied files are written — this is the "public folder" the importer needs.

Stage 2 — MR NextGen Importer. Reads the exporter's package, transforms each record from the legacy format into the new ModernReq4DevOps format, and writes it to the new database.
1. Open the MR NextGen Importer.
2. Target > Connection string: pre-filled for localhost; change it if your ModernReq4DevOps database is on another server.
3. Source > Stage-1 folder: the exporter's output folder (it must contain manifest.json).
4. Public folder: the exported Public Documents folder (the one containing reference.json).
5. Modules to import: leave every module ticked to migrate everything.
6. Click Import. Two safety checks run first: the target database exists, and the NextGen platform has been started against it at least once so its built-in defaults are seeded. If either fails, a message explains what to do and NOTHING is imported.
7. Watch the Log. A summary plus a migration report (a plain-language client version and a detailed technical version) is written next to the Stage-1 folder. "Generate Report" rebuilds the report at any time without running an import.

Two things to flag to customers:
- Rights/Permissions migrate only AFTER NextGen has synced each project's groups. Run that step after the main migration.
- Records with the same identifier are updated in place (upsert), so re-running the import never creates duplicates.`
},
{
  id: 'ng-data-compatibility-warning',
  title: 'NextGen data compatibility — guidance not yet published, do not upgrade production',
  sourceDoc: RN, generation: 'both',
  keywords: ['data compatibility', 'should we upgrade', 'is it safe to upgrade', 'upgrade production', 'migration compatibility', 'can we move to nextgen yet', 'upgrade guidance', 'when can we upgrade'],
  answer: `(Applies across both generations)

Straight from the Release Notes, and worth stating plainly to any customer asking about upgrading:

Migration compatibility for existing MR 2025 data — Smart Docs, baselines, reviews, and related artifacts — is currently UNDER ANALYSIS. Detailed guidance on how existing data will be handled during upgrade to NextGen will be published before general availability.

Modern Requirements strongly recommends that customers refrain from upgrading production environments until the data compatibility guide has been formally published.

For questions or early migration planning, customers should contact support@modernrequirements.com.

Do not tell a customer their production upgrade is safe. The vendor has not said so yet.`
},

// ============================================================
//  Deprecations and feature moves — the "where did X go?" knowledge
// ============================================================
{
  id: 'ng-deprecated-functions-map',
  title: 'Features removed in NextGen and where they went (Simulation, Use Case, FAQ, Smart Note, Impact Assessment)',
  sourceDoc: RN, generation: 'both',
  keywords: ['deprecated', 'removed features', 'where is simulation', 'where is use case', 'where is faq', 'where is smart note', 'where is impact assessment', 'feature missing in nextgen', 'why dont i see this option', 'this worked in 2025', 'what happened to', 'feature moved', 'discontinued', 'no longer available', 'where did it go',
    // Phrased per removed module, because an agent asks about the one module
    // their customer lost, not about "deprecated functions" in the abstract.
    'why dont i see use case', 'use case removed', 'use case missing', 'use case gone', 'no use case module',
    'simulation removed', 'simulation missing', 'simulation gone', 'no simulation module',
    'faq removed', 'faq missing', 'faq gone', 'no faq module',
    'smart note removed', 'smart note missing', 'smart notes gone',
    'impact assessment removed', 'impact assessment missing', 'impact assessment moved',
    'which modules were removed', 'what was deprecated in nextgen', 'modules removed in nextgen',
    'where did the faq module go', 'where did simulation go', 'where did use case go', 'faq module', 'simulation module', 'use case module', 'smart note module'],
  answer: `(Applies across both generations — this is a migration/comparison answer)

Five modules were removed from MR4DevOps in NextGen. Four are replaced by Copilot4DevOps equivalents, one by native Azure DevOps.

  Previously in MR4DevOps   ->  Now in
  Simulation                ->  Mockup (Copilot4DevOps)
  Use Case                  ->  Convert to Use Case (Copilot4DevOps)
  FAQ                       ->  Q&A Assistant (Copilot4DevOps)
  Impact Assessment         ->  Impact Assessment (Copilot4DevOps)
  Smart Notes               ->  Wiki (Azure DevOps)

Why each:
- Simulation: its visual prototyping is now in the Mockup module in Copilot4DevOps, with AI-driven prompt-based generation of high-fidelity UI prototypes.
- Use Case: generate use cases through Convert to Use Case in Copilot4DevOps, which transforms existing requirements or specifications into structured use cases using AI.
- FAQ: consolidated into the Q&A Assistant in Copilot4DevOps — ask natural-language questions about your specifications instead of maintaining static FAQ lists.
- Smart Note: usage data showed it was among the lowest-used modules, with most teams already using Azure DevOps Wiki for free-form notes and meeting documentation.
- Impact Assessment: replaced by the more powerful Impact Assessment module in Copilot4DevOps.

If a customer says "this worked in MR 2025 and I can't find it now", check this list first — the feature has usually moved to Copilot4DevOps rather than been withdrawn.`
},
{
  id: 'ng-reporting-module-status',
  title: 'The Reporting module in NextGen — not in this release, returning in the next one',
  sourceDoc: RN, generation: 'nextgen',
  keywords: ['reporting module', 'where is reporting', 'is reporting available', 'reporting missing', 'reporting coming back', 'whats coming next', 'roadmap', 'reporting nextgen', 'no reporting module'],
  answer: `(MR 2.0 / NextGen)

The Release Notes list Reporting under "What's Coming Next", not under this release:

"The next major release of MR4DevOps will bring back Reporting, reimplemented on the new architecture. The Reporting module has been rebuilt with a refreshed, modern interface fully aligned with the MR NextGen UI."

So for a customer on NextGen today: Reporting as a standalone module is not part of this release and is scheduled to return in the next major release.

What they can use in the meantime: Smart Report is available and is built into both Smart Docs and Traceability — select a template and stylesheet, preview, and export to Word, PDF or HTML, or save to the Document Management Library.

No date is given in the documentation. Do not promise one.`
},
{
  id: 'ng-smart-edit-consolidation',
  title: 'Smart View and Smart Editor became Smart Edit in NextGen',
  sourceDoc: RN, generation: 'both',
  keywords: ['smart edit', 'where is smart view', 'where is smart editor', 'smart view gone', 'smart editor missing', 'unified editing', 'smart edit vs smart view', 'what replaced smart editor', 'linked artifacts moved'],
  answer: `(Applies across both generations — this is a comparison/migration answer)

In MR 2025 these were two separate things: Smart View and Smart Editor. In NextGen they are consolidated into a single view called Smart Edit, available from context menus generally across the modules.

What Smart Edit gives you that the old pair did not:
- One window to view, edit and manage a work item, with inline editing of all fields
- Editable Links and Attachments tabs — add, manage or remove links and files without leaving the view
- Linked Artifacts as a dedicated tab (it used to be a standalone entry point)
- A Variants Hierarchy tab showing the full tree of requirement variants as an interactive flow diagram, each node showing ID, title, assignee and state
- Tags and Discussion fields visible inline
- Up/Down navigation arrows to move between work items without reopening each one — designed for reviewing 100+ requirements in one continuous workflow
- @ to mention a team member and # to link work items while editing HTML fields, matching the Azure DevOps editing experience

So if a customer on NextGen asks "where is Smart Editor / Smart View", the answer is: both are now Smart Edit.`
},
{
  id: 'ng-word-import-became-smart-import',
  title: 'Word Import became the Smart Import module in NextGen',
  sourceDoc: RN, generation: 'both',
  keywords: ['smart import', 'word import', 'where is word import', 'import word document', 'import pdf', 'document to work items', 'six step wizard', 'ruleset template', 'what replaced word import', 'import specification'],
  answer: `(Applies across both generations — this is a comparison/migration answer)

In MR 2025 this was the Word Import feature inside Smart Docs. In NextGen it is Smart Import, its own dedicated module with a guided end-to-end wizard.

What it does: turns existing Microsoft Word and PDF documents into structured Azure DevOps work items without manual re-entry.

Key capabilities:
- Guided six-step wizard: Upload -> Parse -> Map & Classify -> Link -> Preview -> Import, reviewable before anything commits
- Word and PDF support — upload .docx or .pdf files up to 50 MB
- Flexible heading and content mapping — map headings to work item types and control how paragraphs, lists, images and tables are handled
- Table-to-work-item conversion — turn table rows into work items with column-to-field mapping
- Conditional mapping rules — route headings to different work item types using if/else conditions
- Review, classify and link before import — set Azure DevOps fields and add links before committing
- Preview with issue detection — flags duplicates, ambiguous items and missing required fields so they can be resolved before import
- Reusable ruleset templates — save any import configuration for consistent reuse
- Seamless Smart Docs creation — open imported items in Queries or generate a Smart Doc in one step

How to access: open MR4DevOps Frontier, select Smart Import, click New Import on the Browse page, upload a .docx or .pdf, optionally select a ruleset template, then click Parse document to begin mapping.`
},
{
  id: 'ng-ado-extension-changes',
  title: 'NextGen ADO context menu changes, including Create Request renamed to Send for Review',
  sourceDoc: RN, generation: 'both',
  keywords: ['create request renamed', 'send for review', 'where is create request', 'ado context menu', 'right click menu', 'context menu options nextgen', 'extension points', 'renamed option', 'context menu changed'],
  answer: `(Applies across both generations — this is a comparison/migration answer)

Three changes to the Azure DevOps extension points in NextGen:

1. Unified Smart Edit option — "Smart View" and "Smart Editor" are consolidated into "Smart Edit", now available in the context menus generally across the modules.
2. Linked Artifacts moved into Smart Edit — it is now a dedicated tab within Smart Edit, replacing the previous standalone entry point.
3. "Create Request" renamed to "Send for Review" — clearer, more intuitive action labelling. If a customer is looking for Create Request in NextGen, this is what they want.

The full NextGen ADO context menu (right-click a work item in a backlog, board or query result list, or use the vertical-dots options menu):
- Copilot4DevOps — launch the full AI assistant
- AI Edit — open the AI work item editor
- Smart Edit — open the Smart Edit side pane to update work item fields
- Smart Report — generate a report for the selected item
- Send for Review — initiate a formal review request in the Review module
- Create Package — create a Version Package from the selected items
- Create Baseline — capture a baseline snapshot
- Reuse Work Items — copy selected work items into an existing baseline in the current project`
},

// ============================================================
//  NextGen feature enhancements, by module
// ============================================================
{
  id: 'ng-smart-report-enhancements',
  title: 'Smart Report enhancements in NextGen 2026',
  sourceDoc: RN, generation: 'nextgen',
  keywords: ['smart report new features', 'smart report enhancements', 'drag and drop report', 'report part context menu', 'is empty filter', 'copy paste report sections', 'unicode equation', 'signature options smart report', 'grouped field rendering', 'whats new in smart report'],
  answer: `(Smart Report module, MR 2.0 / NextGen)

Seven enhancements in this release:

1. Work item hierarchy drag-and-drop — Up/Down movement controls are replaced by drag-and-drop within the Report Part hierarchy in the designer, where hierarchy rules allow.
2. Report Part context menu — Rename and Delete for Report Parts are now available directly from the context menu.
3. Filter out work items with empty field values — new "Is Empty" and "Is Not Empty" filter operators let you include or exclude records with blank or populated fields (such as Description) before generating.
4. Enhanced grouped field rendering — HTML fields containing only text can now display inline with other grouped fields for a more compact layout. HTML fields with rich content (images, tables, lists) still display on the next line to preserve formatting.
5. Copy and paste report sections — copy sections or subsections within the Smart Report Designer. The copy retains fields, formatting, work item mappings, conditional rules and visible hierarchy.
6. Unicode equation rendering — Unicode and mathematical equations now render correctly during PDF export, in proper formatted form instead of raw LaTeX or plain text.
7. Signature options — generate either "Document Only" or "Document + Work Item Signatures". Available to approvers when generating a report from a Review, or from the Smart Doc version the Review was created on.`
},
{
  id: 'ng-smart-docs-enhancements',
  title: 'Smart Docs enhancements in NextGen 2026',
  sourceDoc: RN, generation: 'nextgen',
  keywords: ['smart docs new features', 'hierarchy view', 'folder structure templates', 'navigate to referenced work items', 'parameter inheritance', 'include sub-paths', 'cross referencing smart docs', 'model diagram support', 'preserve work item linkage', 're-parent keep parent', 'whats new in smart docs'],
  answer: `(Smart Docs module, MR 2.0 / NextGen)

Seven enhancements in this release:

1. Document Hierarchy View — a new "Hierarchy View" toggle on the Document tab to view document hierarchy in a Smart Doc.
2. Folder structure in Document Templates — Template Designer now supports folder-based organisation. Create folders under the Document Template node or nest them, and choose the target folder from the Save as Template dialog.
3. Navigate to referenced work items within a Smart Doc — when a work item is referenced with '#' in an HTML field and exists in the open Smart Doc, clicking it scrolls to and highlights its row instead of opening a new browser tab. Works across the Document and Compare tab grids. Controlled by a new option under Work Item Open Settings (General tab), unchecked by default. If the item isn't in the current Smart Doc, or the setting is off, the original behaviour applies.
4. Parameter inheritance for child Area and Iteration paths — values set at a parent Area/Iteration Path can carry down to child paths. Enable via Parameter Replacement Settings in the Admin Panel: select Area Path or Iteration Path and tick the new "Include sub-paths" checkbox. Inherited parameters appear as grayed-out, read-only rows below the child path's own, each with an information icon showing the source. Hidden by default; applies only to Area Path and Iteration Path — all other fields keep exact-match behaviour.
5. Cross Referencing — reference a numbered item, table or image from one work item inside other work items in the same document. Insert as hyperlink or plain text; clicking a source scrolls to and highlights the referenced item. References carry through to HTML, Word and PDF exports and Smart Report previews as clickable jumps, and can be listed and deleted from the All References tab.
6. Model Diagram support — create Model Diagram work items directly from the grid and open them in the Diagrams module, if the template includes Model Diagram as a child type. Creating one generates the work item plus a linked diagram file with an empty canvas. Diagrams stay intact when you save a version, save as template, clone a Smart Doc, or create one from a template.
7. Preserve work-item linkage on drag-and-drop — drag-and-drop no longer silently rewrites a parent-child link. When a drop would change an existing parent link, Smart Docs prompts before anything is written: "Re-parent" moves the Child link to the drop target; "Keep parent" retains the existing Child link and backs the new position with the template's alternate link type (or no link if blank). The default is set by a new "Parent link on drag & drop" option in Template Designer: Ask each time (default), Always keep existing parent, or Always re-parent to drop target.`
},
{
  id: 'ng-review-enhancements',
  title: 'Review Management enhancements in NextGen 2026, including the Review Dashboard',
  sourceDoc: RN, generation: 'nextgen',
  keywords: ['review dashboard', 'review new features', 'threaded comments', 'auto close review background', 'dedicated administrator account', 'review integrity policy', 'update active reviews', 'mention members review', 'comment indicator', 'mark as completed', 'pre post state rule', 'approval email notification', 'whats new in review'],
  answer: `(Review module, MR 2.0 / NextGen)

Ten enhancements in this release:

1. Review Dashboard — a consolidated view of review health across an area path, regardless of who owns the reviews. Select an area path (sub-areas included by default) from the new Dashboard tab to see every active review under it. KPI cards and charts drill down from reviews, to work items, to the specific reviewers and approvers whose responses are pending. Each review gets an automatically derived status, for open/active reviews only:
   - Complete — every stakeholder has responded on every work item
   - On track — within the due-date range, more than 7 days remaining
   - At risk — 2 days left until the due date
   - Overdue — the due date has passed
   - Pending not due — no due date defined, so it stays open but isn't yet due
   The dashboard is read-only and always reflects each review's current version.
2. Background auto-close for scheduled reviews — auto-close is now handled by the system in the background, so scheduled reviews close on time even when no user is logged in. Requires configuring a PAT in the Admin Panel General tab.
3. Dedicated Administrator account for review auto-comments — organisations can route all automated review actions (approval comments, work item state updates, closing review comments) through one designated system administrator account, for compliance and governance. Step 1: untick the default setting in the Review tab. Step 2: configure a PAT in the General tab.
4. Threaded discussions with comment replies — reply to specific comments to keep related discussion together.
5. Work item 'Approval' email notifications for initiators — previously email went out only on rejection. Initiators now get email for both approval and rejection.
6. Pre/Post state rule clarified — the rule now applies only to work items matching the pre-state conditions. Work items not in pre-state are unaffected and do not block the review action.
7. 'Mark as Completed' visible to reviewers only — the button (previously "Review Completed") now shows only to reviewers.
8. Mention members and reference work items — use "@" to mention project members and "#" to reference work items in the review response field and all comment fields, as in Azure DevOps. "@" opens a searchable drop-down of members with project access and notifies anyone mentioned by email; "#" opens a drop-down of work items across the organisation. Mentions and references carry through to the Feedback and All Responses sections, the work item's ADO Approver Remarks / Review Remarks, and both the Approval Audit Report and Review Results Report.
9. Comment indicator visible to all stakeholders — the comment icon in the Review Status column now shows for Initiators, Reviewers and Approvers on any work item with at least one comment. Previously initiator-only. Hovering shows a count of both comment types.
10. Update active reviews from Smart Docs — update an existing review initiated from a Smart Doc so it reflects newer versions of its work items, including added, removed or revised ones. Click "Update Review" in Smart Docs and pick the review. A confirmation dialog shows the impact before anything commits; add a justification and confirm, and the update commits as a new review version with stakeholders notified. Submitted responses are never edited or deleted — prior approvals are marked superseded and responses archived, both staying visible for audit. Controlled from Organization Settings under the new Review Integrity Policy: "Strict" locks scope and allows no structural changes to active reviews (current existing behaviour); "Flexible" permits all controlled changes, each justified and versioned.`
},
{
  id: 'ng-trace-analysis-enhancements',
  title: 'Trace Analysis enhancements in NextGen 2026 (Tree View, Heatmap, Analytics)',
  sourceDoc: RN, generation: 'nextgen',
  keywords: ['trace analysis new features', 'tree view', 'link tree view', 'intersection matrix list view', 'heatmap', 'analytics tab', 'parent child hierarchy matrix', 'copy url trace', 'traceability enhancements', 'whats new in traceability', 'coverage gaps'],
  answer: `(Trace Analysis module, MR 2.0 / NextGen)

Seven enhancements in this release:

1. Horizontal Matrix — Tree View. A new Tree View tab giving a clearer hierarchical structure of linked work items.
2. Horizontal Matrix — Link Tree View. A visual representation of a single work item's full hierarchy: its ancestors, its position, and whether it has linked children.
3. Intersection Matrix — List View. Presents traceability data in a simplified, structured format that is easier to scan.
4. Intersection Matrix — Heatmap Visualization. A colour-coded coverage view highlighting coverage gaps and areas of high concentration.
5. Analytics Tab. Added to both the Intersection and Horizontal matrices, giving data-driven insight into traceability and coverage.
6. Intersection Matrix — Parent/Child Hierarchy. An optional collapsible hierarchy based on Azure DevOps Parent/Child relationships, with expand (+) and collapse (-). Work items without Parent/Child relationships stay at root level; traceability relationships and matrix calculations are unchanged.
7. Copy URL for Trace files. Copy a Trace file's URL from the file context menu or the overflow menu when the file is open, then paste it into another tab or share it with users who have the required permissions.

For reference, the coverage colour scale used by the Heatmap: Grey 0%, Teal 1-49%, Orange 50-79%, Green 80-100%.`
},
{
  id: 'ng-baseline-enhancements',
  title: 'Baseline enhancements in NextGen 2026',
  sourceDoc: RN, generation: 'nextgen',
  keywords: ['baseline new features', 'baseline details tab', 'source target baseline', 'copy baseline renamed', 'copy work items renamed', 'copy url baseline', 'baseline enhancements', 'whats new in baseline'],
  answer: `(Baseline module, MR 2.0 / NextGen)

Three enhancements in this release:

1. Baseline Details tab simplification — "Source Copied Baseline(s)" and "Target Copied Baseline(s)" are consolidated into "Source Baseline" and "Target Baseline(s)", for a cleaner Details tab.
2. Copy Baseline terminology update — the action previously named "Copy Work Items" is renamed "Copy Baseline", which more accurately reflects the operation. If a customer is looking for "Copy Work Items" in NextGen Baseline, this is it.
3. Copy URL for Baseline files — copy a baseline file's URL from the file context menu or the overflow menu when the file is open, then paste or share it with users who have the required access permissions.`
},
{
  id: 'ng-version-package-enhancements',
  title: 'Version Package enhancements in NextGen 2026 (split-view comparison, indicators, reordering)',
  sourceDoc: RN, generation: 'nextgen',
  keywords: ['version package new features', 'split view comparison', 'variant comparison', 'visual indicators variants', 'linked sub packages', 'status column', 'reorder work items drag drop', 'version package enhancements', 'whats new in version package'],
  answer: `(Version Package module, MR 2.0 / NextGen)

Three enhancements in this release:

1. Enhanced package versions and variants comparison with split view. The Compare tab has an improved split-view layout for comparing package versions and package variants side by side in one view. You choose whether to compare between versions or compare the package with its variants. Changes are highlighted with a colour scheme, with a description of each colour, so added, removed and updated work items are easy to identify.
2. Visual indicators for existing variants and linked/sub packages. At-a-glance indicators identify variants and linked or sub packages without opening each item. A variant indicator appears when there is an associated variant; a link indicator when there are linked or sub packages. Both display in a new, configurable Status column with a hover summary showing counts, and update on refresh across all grid views including filtered and searched results. What the indicators refer to depends on the view — on the Browse page they apply to each version package file (its variant packages and linked/sub packages); in an open package file they apply to each work item (its variants and linked/sub packages).
3. Reordering work items via drag and drop. With package-edit permission you can move a single item, or a group of items sharing the same parent as a block, above or below any sibling at any level of the tree including the top level. The new order is saved for all users and stays consistent in Word and HTML exports, reviews and traceability views. Reordering changes only the order, not the hierarchy — the hierarchy continues to mirror the ADO link structure. Manual order is retained after refresh, and newly linked ADO items are added to the end of their sibling group.`
},
{
  id: 'ng-general-cross-module-enhancements',
  title: 'NextGen 2026 general and cross-module enhancements',
  sourceDoc: RN, generation: 'nextgen',
  keywords: ['general enhancements', 'favorites tab', 'folders auto collapse', 'revision id', 'ado style filtering', 'theme support', 'dark mode', 'responsive design', 'favorite teams', 'remember view settings', 'file name in browser tab', 'multilingual support', 'faster query loading', 'cross module features', 'whats new general'],
  answer: `(General / cross-module, MR 2.0 / NextGen)

Fourteen changes that apply across modules:

1. Revision ID support — moved back to work item 'revision ID' from the 'update ID' across the application.
2. Favorites tab on the Browse page — bookmark and quickly reach your most-used files from one place. Favorites are personal to your account and not visible to colleagues.
3. Folders auto-collapse across the application — folder hierarchies previously displayed fully expanded; they now start collapsed, as in ADO.
4. Smart Edit — unified editing and revision comparison (see the dedicated Smart Edit entry).
5. Smart Edit Variants Hierarchy tab — explore the full tree of requirement variants in an interactive flow diagram; each node shows ID, title, assignee and state.
6. Smart Edit sequential requirement navigation in reviews — Previous/Next arrows at the top right move between requirements without closing and reopening each one. Built for large review packages of 100+ requirements.
7. Advanced ADO-style filtering — a new filter panel in each module replaces the previous basic search, supporting multiple criteria at once (work item type, state, assigned-to, tags and more).
8. Theme support, full ADO theme sync — NextGen automatically reflects whatever theme is set in the Azure DevOps account, including Dark, Light and all other ADO themes. No separate configuration.
9. Responsive design — the interface adapts across desktop and laptop screen sizes and resolutions, removing layout breakage and horizontal scrolling.
10. Favorite teams across modules — mark teams as favorites; they appear at the top of the Team selector and sync across all MR4DevOps modules.
11. Smart Docs and Version Package remember your view settings — toggles (columns, Document View, hierarchy) and Column Options are saved automatically as you apply them. Previously these had to be reconfigured every time.
12. Display file name in browser tab — the tab shows the name of the open file, or the module name when no file is open.
13. Multilingual support — users can interact with the application in their preferred language.
14. Faster Azure DevOps query loading — query dropdowns open quickly even on projects with many saved queries. The query tree loads only its top levels first and deeper folders load on demand, across Traceability, Link to Existing Work Items, Version Package and Baseline Compare. Running a query returns the same work items as before.`
},
{
  id: 'ng-diagrams-module',
  title: 'Diagrams module in NextGen — modernized designer',
  sourceDoc: RN, generation: 'nextgen',
  keywords: ['diagrams nextgen', 'diagram module updated', 'diagram designer', 'shape library', 'stencils', 'bpmn', 'flowchart', 'use case diagram', 'diagram enhancements', 'whats new in diagrams'],
  answer: `(Diagrams module, MR 2.0 / NextGen)

The Diagram module has an updated, modern interface for creating, editing and managing diagrams. It keeps the familiar diagramming capabilities while introducing a cleaner layout, streamlined tools and improved usability.

Key highlights from the Release Notes:
- Modernized Diagram Designer with a cleaner, more intuitive interface
- Enhanced shape library with categorized stencils and search
- Streamlined toolbar for drawing, formatting, layout and connector operations
- Improved workspace and navigation
- Familiar diagramming capabilities presented through an updated, consistent experience

What the module does (Product Overview): a visual workspace for multiple diagram types including flowcharts, BPMN process models and use case diagrams, in one editor. Drag and drop shapes onto the canvas, connect them with configurable connectors, and arrange them into structured visuals — no specialised modelling experience needed. It also supports analysis of the modelled content, and diagrams can be published and linked to downstream artifacts such as use cases and test cases, creating traceability from visual models to the requirements and tests they represent.

How to access: open MR4DevOps Frontier, select Diagram, click New Diagram on the Browse page or open an existing one, and use the shape palette to drag, drop and connect elements.`
},

// ============================================================
//  Performance, reliability, compatibility
// ============================================================
{
  id: 'ng-performance-improvements',
  title: 'NextGen measured performance improvements over MR 2025',
  sourceDoc: RN, generation: 'both',
  keywords: ['performance improvements', 'how much faster', 'is nextgen faster', 'speed improvement', 'faster than 2025', 'benchmark', 'performance numbers', 'load times', 'comparison performance'],
  answer: `(Comparison across generations)

Measured improvements published in the Release Notes:

  Browse Page Loading        ~30% faster
  File Open                  ~50% faster
  Smart Docs Comparison      ~60% faster
  Version Package Comparison ~50% faster
  Baseline Comparison        ~60% faster
  Report Generation          ~50% faster
  Traceability Generation    ~60% faster

Caveat published with them: benchmarks were measured on a standard dataset, and results may vary based on environment configuration and data volume. Note that the Release Notes state the dataset size as a placeholder ("a standard dataset of X work items") rather than an actual number, so there is no work item count to quote.

Reliability alongside performance: 90%+ of known bugs from MR 2025 have been resolved in this release, with improved error handling and graceful degradation, and better recovery from transient Azure DevOps API issues.

Scalability: fully scalable using Azure App auto-scaling, scaling horizontally with demand and with no manual capacity planning required for spiky usage.`
},
{
  id: 'ng-supported-environments',
  title: 'NextGen supported environments (ADO versions and browsers)',
  sourceDoc: RN, generation: 'nextgen',
  keywords: ['supported environments', 'browser support', 'which browsers', 'azure devops version supported', 'ado server 2022', 'compatibility', 'supported ado', 'does nextgen support', 'system compatibility'],
  answer: `(MR 2.0 / NextGen)

- Azure DevOps Services (Cloud): all versions, auto-updated by Microsoft.
- Azure DevOps Server (On-Premise): ADO 2022 and onwards.
- Browser: Chrome, Mozilla Firefox, Microsoft Edge — current and upcoming versions.

Browser caveat from the Release Notes: NextGen has been tested and validated on the current versions of the listed browsers. Older browser versions are not explicitly supported, and keeping the browser up to date is strongly recommended.

Worth flagging on migration calls: MR 2025 supported Azure DevOps 2019, NextGen requires 2022 or later. A customer still on ADO Server 2019 cannot move to NextGen without upgrading Azure DevOps first.

NextGen also requires third-party cookies enabled in the browser for full functionality — the Installation Guide documents how to enable them in Chrome and Edge, including adding the ADO site to the allowed list.`
},
{
  id: 'ng-security-observability-compliance',
  title: 'NextGen security, observability and compliance guidance',
  sourceDoc: RN, generation: 'nextgen',
  keywords: ['security nextgen', 'key vault', 'oauth scopes', 'least privilege', 'observability', 'audit events', 'logging', 'compliance', 'data residency', 'log retention', 'security posture'],
  answer: `(MR 2.0 / NextGen)

The Release Notes give brief guidance rather than a full security specification:

Security — rely on Azure DevOps extension OAuth scopes, secure secrets in Key Vault (recommended), and enforce least privilege.

Observability — centralize logs and audit events in Azure Storage; correlate requests across UI, service and MAF.

Compliance — retain logs per organizational policies; ensure data residency and retention align with customer requirements.

That is the full extent of what the documentation states on these topics. If a customer needs a detailed security posture, control mapping, or a compliance attestation, that is not covered in the material available here — route it to Modern Requirements rather than inferring it.`
},

// ============================================================
//  Module overviews from the Product Overview (Frontier)
// ============================================================
{
  id: 'ng-modules-at-a-glance',
  title: 'NextGen (Frontier) modules at a glance',
  sourceDoc: PO, generation: 'nextgen',
  keywords: ['what modules are there', 'list of modules', 'modules at a glance', 'what does nextgen include', 'frontier modules', 'product overview modules', 'what can nextgen do', 'module list'],
  answer: `(MR 2.0 / NextGen — "Frontier" is the NextGen product branding)

  General Features    Cross-module tools: Smart Report, Favorites Tab, Smart Edit, ADO-style Filter Panel, multilingual and dark theme support
  Version Package     Versioned work item packaging with variant and comparison support
  Smart Docs          Structured requirements authoring, versioning and document management
  Review              Formal review and approval workflow with full audit trail
  Traceability        Bidirectional traceability matrices with coverage analytics
  Baseline            Immutable point-in-time snapshots with comparison and difference reports
  Diagram             Visual diagram creation with drag-and-drop shapes and connectors
  Smart Import        Document-to-work-item conversion with smart mapping and validation
  Test Case Management  Extended test management via Virtual Work Items with end-to-end traceability
  Copilot4DevOps      AI-powered requirements intelligence: elicit, analyze, diagram, chat and more
  Agent4DevOps        AI agent automation and governance across DevOps projects
  AI Edit             AI-powered work item editing from the ADO context menu
  ADO Context Menu    One-click access to Frontier features from anywhere in Azure DevOps
  Admin Panel         Organization-level licensing, configuration and module settings
  Document Management Secure document storage, versioning and collaborative review

Getting started: open the MR4DevOps Frontier extension from the left navigation panel of your Azure DevOps project, then select a module to open its Browse page. Each module's Browse page has a vertical-dots menu with "Discover Help" for contextual step-by-step guidance. If a module is unavailable, the customer should contact their Collection Administrator to confirm permissions or license allocation.`
},
{
  id: 'ng-test-case-management',
  title: 'Test Case Management in NextGen — the five Virtual Work Items',
  sourceDoc: PO, generation: 'nextgen',
  keywords: ['test case management', 'virtual work items', 'test point', 'test run', 'test result', 'test step run', 'requirement category', 'virtual linking', 'test reporting', 'test traceability', 'how does test management work'],
  answer: `(Test Case Management module, MR 2.0 / NextGen)

The problem it solves: Azure DevOps provides Test Plan -> Test Suite -> Test Case, which covers basic organisation but leaves gaps for teams needing richer execution insight — who ran which test, the outcome at each step, and which bugs were raised.

MR4DevOps extends the native ADO testing model through five Virtual Work Items:
- Requirement Category
- Test Point
- Test Run
- Test Result
- Test Step Run

These sit alongside real ADO work items and are connected through Virtual Linking, giving an end-to-end view from the original requirement down to the individual test step outcome and any bugs filed — without requiring changes to the existing ADO process.

Key capabilities:
- Virtual Linking connects requirements, test cases, test execution and bugs in one traceable chain
- Capture rich execution data including step-level outcomes, comments and attachments
- Support for multiple iterations, screen recordings and user action log attachments in Test Results
- Full integration with Traceability and Smart Report for compliance-ready test reporting, without manual data extraction

How to access: Test Case Management data is reached through the Traceability module (Horizontal Matrix with the Test Reporting option) and Smart Report. Select a Test Plan, one or more Test Suites, and test configurations to generate a full traceability view.`
},
{
  id: 'ng-agents4devops',
  title: 'Agents4DevOps in NextGen — AI agent automation and governance',
  sourceDoc: PO, generation: 'nextgen',
  keywords: ['agents4devops', 'agent4devops', 'ai agents', 'jobs tab', 'job explorer', 'skills tab', 'agent library', 'execution agents', 'autonomous agents', 'credit consumption', 'agent permissions', 'agent governance', 'what is agents4devops'],
  answer: `(Agents4DevOps module, MR 2.0 / NextGen)

An end-to-end platform for configuring, running and governing AI agents across DevOps projects.

Core workspaces:
- Jobs tab — master execution history. Every agent run appears as a filterable job with status, credits usage dashboards, and controls to refresh, terminate or delete runs.
- Job Explorer — deep dive into an individual run: run details, agent responses, interactive approval tasks, and an integrated chat assistant.
- Agents — all system and custom agents in a filterable grid. Two kinds can be created: execution agents (built from natural-language instructions, uploaded code/config, or library templates) and assisted autonomous agents (built with AI, manually, or from templates, with configurable triggers, approvals, tools and notifications).
- Skills tab — centralizes reusable capabilities that agents draw on.
- Library — a curated catalogue of prebuilt agents and skills, so teams start from proven patterns.

Administration and governance (in the Admin Panel):
- Define how agents connect to backend services via personal access tokens and base URLs
- Configure outbound email through SMTP or SendGrid, with test emails and audit logs
- Set daily credit-consumption alerts that warn stakeholders and can automatically disable the highest-consuming agents to protect the monthly quota
- Assign prioritized AI models per module, with fallbacks, and select a consistent Chat Assistant model
- Use a Global Tool Call section to enable or disable specific agent capabilities
- A permission model covering twelve key actions (managing, deleting, executing and enabling agents and skills, plus job and task operations) both globally and per project, with inheritance and allow/deny/not-set options

How to access: open MR4DevOps Frontier and select Agent4DevOps. Agents tab to create or reuse agents, Jobs tab for execution history, Skills tab to define agent skills, Library tab to start from prebuilt patterns.

Agents can be run via manual, scheduled, or DevOps event-based triggers.`
},
{
  id: 'ng-ai-edit',
  title: 'AI Edit in NextGen — and how it differs from Copilot4DevOps',
  sourceDoc: PO, generation: 'nextgen',
  keywords: ['ai edit', 'ask anything', 'ai edit modes', 'ai edit vs copilot4devops', 'edit work item with ai', 'refine sections', 'get ai suggestions', 'reading level', 'polish', 'what is ai edit'],
  answer: `(AI Edit, MR 2.0 / NextGen)

A focused AI editing panel available directly from the ADO work item context menu. It opens alongside the selected work item, so you improve and enrich content without leaving ADO.

Four structured modes in the left panel:
- Explore and Review Work Item Content — understand what is already in the item
- Edit Descriptions and Details — update and improve field content with AI assistance
- Refine Specific Sections — target a particular area for refinement
- Get AI-Powered Suggestions — receive proactive improvement recommendations

At the bottom is a free-form "Ask Anything" chat input for a direct conversation about the selected work item — requesting rewrites, adjusting reading level, changing length, adding acceptance criteria, or applying polish. Edits save back to ADO with the Save Changes button.

How it differs from Copilot4DevOps: AI Edit is for quick, in-context assistance on an individual work item without opening the full Copilot4DevOps interface. Copilot4DevOps is the full AI workspace with sixteen functions across Refine & Convert, Visualize & Design, Assistant & Support, and Advanced Tools. If a customer wants to elicit a backlog, run an impact assessment or generate a mockup, that is Copilot4DevOps; if they want to tighten the wording of one requirement, that is AI Edit.

How to access: right-click any work item in ADO (backlog, query results, or board) and select AI Edit.`
},
{
  id: 'ng-admin-panel',
  title: 'NextGen Admin Panel — tabs and access',
  sourceDoc: PO, generation: 'nextgen',
  keywords: ['admin panel nextgen', 'organization settings', 'licensing tab', 'general tab', 'admin configuration', 'who can access admin panel', 'collection administrator', 'module settings', 'where is the admin panel'],
  answer: `(Admin Panel, MR 2.0 / NextGen)

The central configuration console, accessible to Collection Administrators at the Azure DevOps organization level.

How to access: Azure DevOps > Organization Settings > locate the MR4DevOps Frontier / Modern Requirements4DevOps section. Collection Administrators only.

Tabs:
- Licensing — live license status and seat usage across the organization
- General — product-wide defaults and integration settings that apply across all modules
- Smart Docs, Baseline, Review, Copilot4DevOps — module-specific configuration tabs, each exposing that module's settings and defaults

What administrators can do from here: enforce field requirements, set default templates, configure integration options, and manage which features are enabled for end users — so all teams work within a consistent, governed configuration without per-user or per-project setup.

Two NextGen settings support agents ask about most often, both in the General tab:
- Automated System Task Configuration — the Personal Access Token (PAT) used for background tasks such as review auto-close and automated review comments, plus a notification email for PAT expiry.
- Work Item Open Settings — including the new option to navigate to a referenced work item within the current Smart Doc rather than opening a new browser tab.`
},
{
  id: 'ng-document-management',
  title: 'Document Management in NextGen',
  sourceDoc: PO, generation: 'nextgen',
  keywords: ['document management nextgen', 'my documents', 'shared documents', 'check out check in', 'document versioning', 'rollback document', 'compare word versions', 'dms', 'document library', 'upload document'],
  answer: `(Document Management module, MR 2.0 / NextGen)

Document storage, versioning and collaborative review inside Azure DevOps.

Organisation: documents live in My Documents (a personal workspace) and Shared Documents (a team-accessible library), with favorites, keyword filtering and folder-based navigation. The interface supports viewing, renaming and removing documents and folders.

Collaboration: check-out and check-in functionality gives version control where multiple stakeholders work on the same documents simultaneously.

Versioning: full document versioning lets teams track every change, select any previous version for review, and roll back to an earlier state when required.

Comparison: for Microsoft Word documents, compare all different versions of a document at the same time, giving visibility into what changed between any two points in a document's history.

How to access: open MR4DevOps Frontier, select Document Management, switch between My Documents and Shared Documents using the workspace tabs, and use the vertical-dots menu on any document to check out, compare versions, or roll back.

Migration note: if a customer is moving from MR 2025, DMS database records are migrated by the MR Exporter's "Include DMS database" option, but DMS FILE CONTENTS are not part of that migration — only the database records.`
}

];

// ---------------- write ----------------
function main() {
  const dryRun = process.argv.includes('--dry-run');
  const db = kbStore.db;

  const ids = entries.map((e) => e.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) throw new Error('duplicate ids: ' + dupes.join(', '));

  console.log(`${entries.length} curated NextGen entries`);
  const byGen = {};
  entries.forEach((e) => { byGen[e.generation] = (byGen[e.generation] || 0) + 1; });
  console.log('  by generation: ' + JSON.stringify(byGen));
  console.log('  sources: ' + [...new Set(entries.map((e) => e.sourceDoc))].join(' | '));

  if (dryRun) {
    console.log('\n--- dry run, nothing written. First entry: ---');
    console.log(JSON.stringify(entries[0], null, 2).slice(0, 1200));
    return;
  }

  const upsert = db.prepare(`
    INSERT INTO kb_entries (id, title, sourceDoc, page, keywords, answer, generation, relatedIds)
    VALUES (@id, @title, @sourceDoc, 0, @keywords, @answer, @generation, @relatedIds)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, sourceDoc = excluded.sourceDoc,
      keywords = excluded.keywords, answer = excluded.answer,
      generation = excluded.generation, relatedIds = excluded.relatedIds
  `);
  // Every curated NextGen entry is related to the version-identification entry:
  // it is the one that has to be settled before any of the others can be used.
  const run = db.transaction((rows) => {
    rows.forEach((e) => upsert.run({
      id: e.id, title: e.title, sourceDoc: e.sourceDoc,
      keywords: JSON.stringify(e.keywords), answer: e.answer,
      generation: e.generation,
      relatedIds: JSON.stringify(e.id === 'ng-which-generation-am-i-on' ? [] : ['ng-which-generation-am-i-on'])
    }));
  });
  run(entries);
  kbStore.exportKbJson();
  console.log(`\nWrote ${entries.length} entries. Mirror data/kb.json regenerated.`);
  console.log('Restart the server to pick these up.');
}

if (require.main === module) main();
module.exports = { entries };
