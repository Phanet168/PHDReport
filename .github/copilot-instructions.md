# Copilot Instructions — PHDReport Codebase

**Purpose:** Enable AI agents to become immediately productive in this mixed-stack Khmer healthcare reporting dashboard (vanilla JS frontend + Firebase backend).

## Architecture Overview

### Frontend Stack
- **Served via:** XAMPP/Apache (`http://localhost/PHDReport/`) or PHP built-in (`php -S localhost:8000 -t .`)
- **Routing:** Hash-based (`#/settings/indicators`, `#/reports`) via [assets/js/router.js](assets/js/router.js)
  - Flow: hash change → fetch HTML from `pages/` → call [assets/js/hydrate.js](assets/js/hydrate.js) → execute page module
  - Modules map: ROUTE constant in [assets/js/hydrate.js](assets/js/hydrate.js#L14) links route slugs to `assets/js/pages/*.page.js`
- **Page module pattern:** Route `#/settings/indicators` → `pages/settings/indicators/index.html` + `assets/js/pages/indicators.page.js`
  - Each `.page.js` exports default async function `hydratePageName(root, ctx)` receiving DOM root and context
  - Must manually query stable element IDs and wire event listeners (no framework reactivity)
- **API client layers:**
  - [assets/js/app.api.firebase.js](assets/js/app.api.firebase.js) — Firestore CRUD (`gasList`, `gasSave`, `gasDelete`) with ID field mapping per collection
  - [assets/js/app.api.js](assets/js/app.api.js) — Legacy Google Apps Script integration (Sheets sync)
- **Auth:** [assets/js/app.auth.firebase.js](assets/js/app.auth.firebase.js) + [assets/js/app.auth.js](assets/js/app.auth.js) — Firebase Auth + role-based access (roles: `super`, `admin`, user)

### Backend (Firebase Cloud Functions)
- **Location:** `functions/` (Node 18, Firebase Admin SDK)
- **Entry:** [functions/index.js](functions/index.js) — exports `adminSetPassword`, `adminCreateUser`, etc. (SUPER-only role checks)
  - Auth validation pattern: `if (role !== 'super') throw new functions.https.HttpsError('permission-denied', msg)`
- **Database:** Firestore with collections: `indicators`, `departments`, `units`, `reports`, `periods`, `users`, `issues`, `actions`, `import_mappings`, `meta`
- **Authentication:** Firebase Auth with custom role claim via `context.auth.token.role` (set via Firebase CLI or Admin SDK)
- **Dependencies:** `firebase-admin@^12.6.0`, `firebase-functions@^5.0.1`
- **Commands:**
  - Local emulator: `cd functions && npm run serve` (starts on default port, client must use emulator config)
  - Deploy: `cd functions && npm run deploy` (requires Firebase CLI authenticated)

### Build & Artifacts
- **Source:** `assets/js/`, `assets/css/`, `pages/` — edit these
- **Production bundles:** `dist-assets/js/app.js`, `dist-assets/css/third-party.bundle.css` — **do not edit directly**
- **No build script in repo.** Build pipeline is external (CI or local build tool not provided).

## Key Data Patterns

### Firestore ID Field Conventions
Different collections use different ID field names (stored as document fields, not just `doc.id`):
- `indicators` → `indicator_id` (usually UUID, nullable for draft status)
- `departments` → `department_id`
- `units` → `unit_id`
- `periods` → `period_id`
- `users` → `user_id`
- `issues` → `issue_id`
- `actions` → `action_id`
- `import_mappings` → `indicator_id` (keys mapped by indicator)
- `reports` → **composite key:** `period_id__indicator_id__unit_id` (see `composeReportId()` in [app.api.firebase.js](assets/js/app.api.firebase.js#L36))

**Important:** Always use the correct ID field when querying via `gasList()`. See [assets/js/app.api.firebase.js](assets/js/app.api.firebase.js#L13) `ID_FIELDS` constant. For reports, use the composite ID pattern which prevents duplicates automatically.

### Period/Timing Schema
- **Format:** `YYYY-T` where T is a tag: `Y` (full year), `Q1`–`Q4` (quarters), `H1`–`H2` (halves), `M01`–`M12` (months), `N9` (9-month).
- **Example:** `2025-Y`, `2024-Q1`, `2024-M09`
- **Reports composites:** Primary key is `period_id__indicator_id__unit_id` (see [assets/js/app.api.firebase.js](assets/js/app.api.firebase.js#L36) `composeReportId()`).
- **Parsing:** See [assets/js/pages/reports.page.js](assets/js/pages/reports.page.js#L48) `normPeriod()` for robust period extraction from multiple field schemas (handles legacy `year`/`tag` fields and modern `period_id`).

### Page Module Hydration Pattern
The hydration system in [assets/js/hydrate.js](assets/js/hydrate.js) executes page modules in strict order:
1. **Route to module mapping:** Hash `#/settings/indicators` → slug `indicators` (via ROUTE constant)
2. **Dynamic import:** Loads `assets/js/pages/indicators.page.js`
3. **Hydration:** Calls exported `default` async function: `hydratePageName(root, ctx)`
   - `root`: DOM element containing loaded HTML (id="route-outlet")
   - `ctx`: Object with `{ path, slug }`
4. **Page must query by ID:** Use stable element IDs like `#tblReportsBody`, `#reportYear`, `#btnSearch`, `#statusLine`
   - Wire event listeners manually (Bootstrap modal example in [assets/js/pages/indicators.page.js](assets/js/pages/indicators.page.js#L4))
5. **Error handling:** Uncaught errors logged to console; router catches and shows error div

**Critical:** Each page is hydrated fresh on route change. Do not rely on global state—always fetch fresh data via `gasList()` in the hydrate function.

### Querying Firestore from Client
Use [assets/js/app.api.firebase.js](assets/js/app.api.firebase.js) `gasList()` function with params:
```javascript
// Basic query with equals filters (only fields in EQ_KEYS_GENERIC are filtered)
const rows = await gasList('indicators', { unit_id: 'unit-5', owner_uid: currentUser.uid });

// With ordering and limit
const rows = await gasList('periods', { order_by: 'period_id', order_dir: 'desc', limit: 10 });

// Reports need special composite key handling
const report = await gasList('reports', { period_id: '2025-Y', indicator_id: 'ind-1', unit_id: 'unit-5' });
```

Supported generic filters in `gasList()`: `period_id`, `indicator_id`, `unit_id`, `owner_uid`, `owner_id`, `department_id`, `user_id`.
- **Important:** Only these pre-defined fields support filtering. For other constraints, fetch all docs and filter in JS.
- Returns array of docs with shape `{ id: docId, ...fields }` where `id` is the Firestore document ID, not the ID field.

### Localization
- UI text (Khmer) is hard-coded in HTML. When adding features, place Khmer labels directly in page HTML, e.g., `<label>សូចនាករ</label>` (Indicator).
- **Font:** Noto Sans Khmer (loaded from Google Fonts in [index.html](index.html))
  - Required for proper Khmer Unicode rendering in browser and print exports
  - Link: `https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;600&display=swap`
- **Excel exports:** Use `ExcelJS.Workbook` (NOT XLSX.js) for Khmer Unicode support
- **PDF exports:** Use HTML print method with `<meta charset="utf-8">` + Noto Sans Khmer font link (jsPDF lacks Khmer font support)

## Developer Workflows

### Start local dev server
```bash
# Option 1: XAMPP (if available)
# Open http://localhost/PHDReport/

# Option 2: PHP built-in
php -S localhost:8000 -t .
# Then visit http://localhost:8000/
```

### Work with Firebase locally
```bash
cd functions
npm install
npm run serve          # Start emulator on port 5001 (requires firebase-tools)
```
Then client JS in dev calls local emulator instead of production (if configured in [assets/js/firebase.client.js](assets/js/firebase.client.js)).

### Add a new page
1. Create `pages/<slug>/index.html`
2. Create `assets/js/pages/<slug>.page.js` exporting default async function `hydratePageName(root, ctx)`
3. Register route in [assets/js/router.js](assets/js/router.js#L3) ROUTES map
4. Register module in [assets/js/hydrate.js](assets/js/hydrate.js#L14) ROUTE map

### Modify existing page
- Edit page logic in `assets/js/pages/<slug>.page.js`
- Update page HTML template in `pages/.../<slug>/index.html`
- Test in browser: navigate to route or hard-reload (Ctrl+Shift+R).

## Integration Points

### Client → Cloud
Client JS → Firebase Auth + Firestore ← Cloud Functions (custom role checks).
Example flow: [assets/js/pages/indicators.page.js](assets/js/pages/indicators.page.js) (save) → `gasSave()` → Firestore → ✓ success or error toast.

### Server-side Auth
Cloud Functions validate `context.auth.token.role` before mutating data. Example: [functions/index.js](functions/index.js#L6) `adminSetPassword` checks `if (role !== 'super')`.

### Config & Secrets
- **Firebase config:** [assets/js/firebase.client.js](assets/js/firebase.client.js) — API key, project ID, etc. (already initialized for project `dbreportphd`)
- **Google Apps Script endpoint:** [assets/js/config.js](assets/js/config.js) — legacy sync URL (uses JSONP to bypass CORS)

## Common Tasks

| Task | Where | How |
|------|-------|-----|
| Fix a page UI | `pages/*/index.html` | Edit HTML template; reload browser |
| Add form logic | `assets/js/pages/*.page.js` | Import `gasList`, `gasSave`; wire event listeners |
| Role check | `assets/js/app.auth.firebase.js` | Use `isSuper()`, `isAdmin()` helpers |
| Query Firestore | `assets/js/app.api.firebase.js` | Call `gasList(collName, { filters... })` |
| Create Cloud Function | `functions/index.js` | Export new `exports.funcName = functions.https.onCall(...)` |
| Test backend locally | `functions/` | Run `npm run serve`, calls auto-route to emulator |

## Critical Patterns & Anti-Patterns

### Transactional Saves for Reports
**IMPORTANT:** For `reports` collection, use **Firestore transactions directly**, NOT `gasSave()`. This prevents race conditions in multi-user data entry:
```javascript
import { doc, runTransaction, serverTimestamp } from "firebase-firestore.js";

const docId = composeReportId(period_id, indicator_id, unit_id);
const ref = doc(db, 'reports', docId);

const saved = await runTransaction(db, async (tx) => {
  const snap = await tx.get(ref);
  const exists = snap.exists();
  const base = exists ? (snap.data() || {}) : {};
  
  const next = {
    ...base, id: docId, period_id, indicator_id, unit_id,
    value: toNumber(row.value), target: toNumber(row.target),
    updated_at: serverTimestamp(),
    ...(exists ? {} : { created_at: serverTimestamp() })
  };
  
  tx.set(ref, next, { merge: true });
  return { next, exists };
});
```
See [data-entry.page.js](assets/js/pages/data-entry.page.js#L509) `saveOrUpdate()` for full example.

### Dirty Tracking Pattern
Complex forms (data-entry, reports) track pending changes in a `Map` before batch save:
```javascript
const DIRTY = new Map(); // "indicator_id|unit_id" -> {indicator_id, unit_id, period_id, value, target}

function markDirty(key, field, value) {
  const prev = DIRTY.get(key) || { ...baseRow };
  prev[field] = value;
  DIRTY.set(key, prev);
  updateDirtyBadge(); // Show floating "Save" dock with count
}
```
Includes floating **Save Dock** UI (bottom-right, z-index:1050) created via `ensureSaveDock()` pattern.

### Export Utilities
Pages support XLSX/PDF export via optional libraries with graceful fallbacks:
- **XLSX:** Try `ExcelJS.Workbook` (proper Unicode/Khmer support), fallback to CSV with UTF-8 BOM (`'\uFEFF' + csv`)
- **PDF:** Try `jspdf.jsPDF` + `autoTable`, fallback to `window.open()` HTML print dialog
  - **CRITICAL:** jsPDF does NOT support Khmer Unicode fonts by default—Khmer text will render as boxes/missing glyphs
  - **Solution:** HTML print fallback method DOES support Khmer via `<meta charset="utf-8">` + system fonts (`Noto Sans Khmer`)
  - When Khmer content is primary, prefer HTML print method over jsPDF, or skip jsPDF check entirely

Check library availability before use: `if (window.ExcelJS?.Workbook)` / `if (window.jspdf?.jsPDF)`.

**Example: Khmer-safe PDF export**
```javascript
function exportPdf(){
  const pid=curPid(); const label=pid?prettyPid(pid):'period';
  const rows=getCurrentViewRows();
  
  // Skip jsPDF for Khmer content - use HTML print directly
  const win=window.open('','_blank'); 
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  win.document.write(`
    <html><head>
      <meta charset="utf-8">
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;600&display=swap" rel="stylesheet">
      <title>Reports • ${esc(label)}</title>
      <style>
        body{font-family:'Noto Sans Khmer',system-ui,sans-serif;margin:24px}
        table{border-collapse:collapse;width:100%}
        th,td{border:1px solid #ddd;padding:6px 8px;font-size:12px}
        th{background:#f5f5f5;font-weight:600}
        @media print{@page{margin:1cm}}
      </style>
    </head><body>
      <h2>Reports • ${esc(label)}</h2>
      <table><!-- table content --></table>
      <script>window.onload=()=>window.print()</script>
    </body></html>
  `);
  win.document.close();
}
```

### Khmer Localization Utilities
Shared helper functions for Khmer number formatting (copy from existing pages if needed):
```javascript
const KH_MONTHS = ['មករា','កុម្ភៈ','មិនា','មេសា','ឧសភា','មិថុនា','កក្កដា','សីហា','កញ្ញា','តុលា','វិច្ឆិកា','ធ្នូ'];
const KH_DIG = {'0':'០','1':'១','2':'២','3':'៣','4':'៤','5':'៥','6':'៦','7':'៧','8':'៨','9':'៩'};
const khDigits = s => String(s).replace(/[0-9]/g, d => KH_DIG[d]);

// Period formatting: "2025-M03" → "មិនា ២០២៥" (March 2025)
function prettyPid(pid) {
  const {year, type, month, tag} = parsePid(pid);
  const y = khDigits(year);
  if (type === 'month') return `${KH_MONTHS[month-1]} ${y}`;
  if (type === 'quarter') return `ត្រីមាស ${khDigits(tag.slice(1))} • ${y}`;
  // ... (see data-entry.page.js#L33)
}
```

### Period Schema & Parsing
Period IDs follow pattern `YYYY-T` where `T` is tag: `Y12`/`Y` (year), `Q1-Q4` (quarter), `H1-H2` (half), `M01-M12` (month).
Robust parsing via `parsePid(pid)` extracts `{year, tag, type, month}` — handles both `2025-03` and `2025M03` variants.
For "previous period" logic (Copy Previous feature), use `prevPid(pid)` which correctly rolls back months/quarters/years.

## Error Handling Patterns

### Client-side Error Handling
Page modules typically catch errors during `gasSave()` or `gasList()` and display user feedback via status elements or alerts:
```javascript
try {
  await gasSave('indicators', doc);
  setStatus('រក្សាទុកបានដោយជោគជ័យ', true); // Update status line
} catch (err) {
  console.error('[save]', err);
  alert('មានបញ្ហាក្នុងការរក្សាទុក: ' + err.message);
  setStatus('បរាជ័យរក្សាទុក', false); // Mark status as error
}
```
Where `setStatus(message, isOk)` updates a `#statusLine` element's text and toggles `text-danger` class for visual feedback.

### Server-side Auth Errors
Cloud Functions throw `HttpsError` with standardized codes for client interpretation:
- `unauthenticated` — User not signed in
- `permission-denied` — User lacks required role
- `invalid-argument` — Bad input validation
- `internal` — Unexpected server error

Client must check `context.auth` and `context.auth.token.role` before any mutation.

## Do NOT Assume
- **No build script** — changes to source JS/CSS under `assets/` won't auto-compile to `dist-assets/`. Either manually update `dist-assets/` 
- **jsPDF cannot render Khmer** — use HTML print export method for Khmer content; jsPDF will show missing glyphs/boxes without custom font embedding.or ask maintainer about the build pipeline.
- **No automated tests** — validate via browser devtools, emulator, and manual testing.
- **Khmer text is literal** — no i18n system; translation or UI text changes require direct HTML/JS edits.
- **Multiple `gasList` implementations** — codebase has two versions with slight differences; prefer the one imported by actual page modules.
- **Reports use transactions** — do NOT use `gasSave()` for reports collection; use `runTransaction()` directly to prevent duplicate entries.