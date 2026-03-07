// assets/js/hydrate.js
// =======================
// Clean + Stable Hydration System for PHDReport
// =======================

/*
 ROUTE → JS module mapping
 Example:
   #/settings/minute  → assets/js/pages/minute.page.js
*/
const ROUTE = {
  "":                        "home",
  "dashboard":               "dashboard",
  "data-entry":              "data-entry",
  "reports":                 "reports",
  "issues":                  "issues",
  "super":                   "super-dashboard",
  "super-dashboard":         "super-dashboard",

  // Settings
  "settings/indicators":     "indicators",
  "settings/departments":    "departments",
  "settings/units":          "units",
  "settings/periods":        "periods",
  "settings/users":          "users",
  "settings/import-excel":   "import-excel",
  "settings/import-mapping": "import-mapping",
  "settings/minute":         "minute",
};

/* Clean path: "#/settings/minute" → "settings/minute" */
function cleanPath(p) {
  const cleaned = String(p || "")
    .replace(/^#\//, "")  // Remove #/
    .replace(/^#/, "")    // Remove just # (edge case)
    .replace(/\/+$/, "")  // Remove trailing slashes
    .trim();
  console.log('[cleanPath] input:', p, '→ output:', cleaned);
  return cleaned;
}

/*
 Load JS module for page:
   import-excel → /PHDReport/assets/js/pages/import-excel.page.js
   minute → /PHDReport/assets/js/pages/minute.page.js
*/
async function loadModule(slug) {
  const urls = [
    `/PHDReport/assets/js/pages/${slug}.page.js`,
    `/assets/js/pages/${slug}.page.js`,
  ];

  let lastError;
  for (const url of urls) {
    try {
      console.log('[loadModule] Trying to import:', url);
      const mod = await import(/* @vite-ignore */ url);
      console.log('[loadModule] SUCCESS loaded:', url);
      return mod;
    } catch (err) {
      console.log('[loadModule] Failed to load', url, ':', err.message);
      lastError = err;
    }
  }
  const msg = `Cannot import module for slug="${slug}". Tried: ${urls.join(', ')}. Last error: ${lastError?.message}`;
  console.error('[loadModule]', msg);
  throw new Error(msg);
}

/* ========== Exported function (REQUIRED BY router.js) ========== */
export async function hydratePage(root, rawPath) {
  if (!root) return;

  const path = cleanPath(rawPath || location.hash);
  let slug = ROUTE[path];

  console.log('[hydratePage] DEBUG rawPath:', rawPath, 'cleaned path:', path, 'slug:', slug, 'ROUTE keys:', Object.keys(ROUTE));

  if (!slug) {
    // Fallback: try exact match in ROUTE keys
    const exactMatch = Object.keys(ROUTE).find(k => k === path);
    if (exactMatch) {
      slug = ROUTE[exactMatch];
      console.log('[hydratePage] Found via exact match:', slug);
    } else {
      console.warn("No slug for path:", path, "Available routes:", Object.keys(ROUTE));
      return;
    }
  }

  try {
    const mod = await loadModule(slug);
    const hydrateFn = mod.default || mod.hydrate;
    const ctx = { path, slug };

    if (typeof hydrateFn === "function") {
      await hydrateFn(root, ctx);
    }

    // Optional title handler
    if (typeof mod.getTitle === "function") {
      const title = mod.getTitle(ctx);
      if (title) document.title = title;
    }

  } catch (err) {
    console.error("hydratePage error:", err);
    root.innerHTML = `
      <div class="container-page mt-4">
        <div class="alert alert-danger">
          មិនអាចផ្ទុក JS module សម្រាប់ <b>${slug}</b><br/>
          <small>${err?.message || err}</small>
        </div>
      </div>`;
  }
}
