// === Base URL of your deployed Apps Script Web App (must end with /exec) ===
export const GAS_BASE = 'https://script.google.com/macros/s/AKfycbwQXnt94_gGbJd3iZXk8hb-3xbA6oGwXuEcx4xqzu7GBYK9yVTfT_hZOSTBmvz8E_l-tg/exec';



// Helper បង្កើត URL បន្ថែម api=1 និង params ដោយសុវត្ថិភាព
function makeUrl(params = {}) {
  const u = new URL(GAS_BASE, location.origin);
  if (!u.searchParams.has('api')) u.searchParams.set('api', '1');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  }
  return u.toString();
}

// GET (JSON)
export async function gasGet(params) {
  const r = await fetch(makeUrl(params), { cache: 'no-store' });
  const j = await r.json().catch(()=> ({}));
  if (j && j.ok === false) throw new Error(j.error || 'API error');
  return j;
}

// POST (JSON) — Content-Type:text/plain ដើម្បីគ្មាន preflight
export async function gasPost(params, body) {
  const r = await fetch(makeUrl(params), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body || {})
  });
  const j = await r.json().catch(()=> ({}));
  if (j && j.ok === false) throw new Error(j.error || 'API error');
  return j;
}
