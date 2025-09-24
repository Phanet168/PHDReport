// assets/js/hydrate.js
const MAP = {
  'settings/indicators': 'indicators',
  'settings/departments': 'departments',
  'settings/units':       'units',
  'settings/periods':     'periods',   // 👈 សម្រាប់ periods
};

function runInlineScripts(root) {
  const nodes = root.querySelectorAll('script[type="module"], script[data-run]');
  nodes.forEach(old => {
    const s = document.createElement('script');
    s.type = 'module';
    if (old.src) {
      s.src = new URL(old.getAttribute('src'), location.href).href;
    } else {
      s.textContent = old.textContent || '';
    }
    document.head.appendChild(s);
    // cleanup
    setTimeout(() => document.head.removeChild(s), 0);
  });
}

export async function hydratePage(root, hash) {
  const key  = String(hash || '#/').replace(/^#\//,'');
  const name = MAP[key];

  // 1) ព្យាយាម import page module
  if (name) {
    try {
      const href = new URL(`./assets/js/pages/${name}.page.js`, location.href).href;
      console.log('[hydrate] import', href);
      const mod = await import(/* @vite-ignore */ href);
      const fn  = mod.default || mod.hydrate;
      if (typeof fn === 'function') {
        await fn(root);
        return;
      }
    } catch (e) {
      console.warn('[hydrate] dynamic import failed → will try inline scripts.', e);
    }
  }

  // 2) fallback: រាន់ inline scripts នៅក្នុង view
  runInlineScripts(root);
}
