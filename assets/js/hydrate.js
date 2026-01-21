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
  "data-entry":              "data-entry",
  "reports":                 "reports",
  "issues":                  "issues",
  "super":                   "super-dashboard",

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
  return String(p || "")
    .replace(/^#\//, "")
    .replace(/\/+$/, "");
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
      return await import(/* @vite-ignore */ url);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Cannot import module for slug="${slug}"`);
}

/* ========== Exported function (REQUIRED BY router.js) ========== */
export async function hydratePage(root, rawPath) {
  if (!root) return;

  const path = cleanPath(rawPath || location.hash);
  const slug = ROUTE[path];

  if (!slug) {
    console.warn("No slug for path:", path);
    return;
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
