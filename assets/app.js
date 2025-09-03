// ===== Utilities =====
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function setSrcLabel(url){ $('#srcLabel').textContent = url || '(not set)'; }

// Load/save API URL (Settings)
const API_KEY = 'HC_API_URL';
function getApiUrl(){ return localStorage.getItem(API_KEY) || window.APPSCRIPT_URL; }
function setApiUrl(u){ localStorage.setItem(API_KEY, u); setSrcLabel(u); }

// Mirror desktop/mobile filter selects
function syncFiltersToMobile(){
  $('#per_m').innerHTML = $('#per').innerHTML;
  $('#org_m').innerHTML = $('#org').innerHTML;
  $('#orgType_m').value = $('#orgType').value;
  $('#per_m').value = $('#per').value;
  $('#org_m').value = $('#org').value;
}

// ===== Data + Render =====
let allRows = [];
let barChart;

async function loadJSON(){
  const url = getApiUrl();
  setSrcLabel(url);
  $('#hint').textContent = 'Loading…';
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();

  allRows = (data.report_values || []).map(r => ({
    org_unit_id: String(r.org_unit_id||'').trim(),
    org_type: String(r.org_type||'').trim(),
    period_id: String(r.period_id||'').trim(),
    indicator_id: String(r.indicator_id||'').trim(),
    age_group: String(r.age_group||'').trim(),
    sex: String(r.sex||'').trim(),
    icd10_code: String(r.icd10_code||'').trim(),
    value_num: Number(r.value_num ?? r.value ?? 0),
    source_note: String(r.source_note||'').trim()
  }));

  // Build filter lists
  const periods = Array.from(new Set(allRows.map(r=>r.period_id))).filter(Boolean).sort().reverse();
  const orgs = Array.from(new Set(allRows.map(r=>r.org_unit_id))).filter(Boolean).sort();

  $('#per').innerHTML = periods.map(p=>`<option>${p}</option>`).join('');
  $('#org').innerHTML = '<option value="">All</option>' + orgs.map(o=>`<option>${o}</option>`).join('');

  // choose latest
  $('#per').value = periods[0] || '';
  syncFiltersToMobile();

  $('#hint').textContent = `Loaded ${allRows.length} rows`;
  applyFilters();
}

function applyFilters(isMobile=false){
  // read from either desktop or mobile controls
  const per = (isMobile ? $('#per_m') : $('#per')).value;
  const orgType = (isMobile ? $('#orgType_m') : $('#orgType')).value;
  const org = (isMobile ? $('#org_m') : $('#org')).value;

  let rows = allRows;
  if (per) rows = rows.filter(r=>r.period_id===per);
  if (orgType) rows = rows.filter(r=>r.org_type===orgType);
  if (org) rows = rows.filter(r=>r.org_unit_id===org);

  // KPIs
  let deaths=0, disch=0, opd=0, ipd=0;
  const sums = {};
  for(const r of rows){
    const v = r.value_num || 0;
    sums[r.indicator_id] = (sums[r.indicator_id]||0)+v;
    if(r.indicator_id==='IPD_003') deaths+=v;
    if(r.indicator_id==='IPD_002') disch+=v;
    if(r.indicator_id==='OPD_REF') opd+=v;
    if(r.indicator_id==='IPD_REF') ipd+=v;
  }
  const rate = disch ? Math.round(10000*deaths/disch)/100 : 0;
  $('#kpiMort').textContent = `${deaths} / ${disch} → ${rate}%`;
  $('#kpiRef').textContent = `OPD ${opd} • IPD ${ipd}`;
  const top = Object.entries(sums).sort((a,b)=>b[1]-a[1])[0];
  $('#kpiTop').textContent = top ? `${top[0]}: ${top[1]}` : '—';
  $('#hint').textContent = `Showing ${rows.length} rows • ${org||'All'} ${orgType||''} @ ${per||'latest'}`;

  // Chart top 10
  const top10 = Object.entries(sums).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const labels = top10.map(x=>x[0]); const vals = top10.map(x=>x[1]);
  const ctx = document.getElementById('barTop');
  if(!barChart){
    barChart = new Chart(ctx, { type:'bar',
      data:{labels, datasets:[{label:'Total', data:vals}]},
      options:{responsive:true, plugins:{legend:{display:false}}, scales:{x:{ticks:{maxRotation:45}}}}
    });
  } else {
    barChart.data.labels = labels; barChart.data.datasets[0].data = vals; barChart.update();
  }

  // Table preview
  renderTable(rows.slice(0, 500));
}

function renderTable(rows){
  const cols = ['org_unit_id','org_type','period_id','indicator_id','age_group','sex','icd10_code','value_num','source_note'];
  let html = '<table class="table table-sm mb-0"><thead><tr>' + cols.map(c=>`<th>${c}</th>`).join('') + '</tr></thead><tbody>';
  for(const r of rows){
    html += '<tr>' + cols.map(c=>`<td>${r[c]??''}</td>`).join('') + '</tr>';
  }
  html += '</tbody></table>';
  $('#tblWrap').innerHTML = html;
}

// ===== Nav handling in right menu =====
function showScreen(id){
  $$('.nav-screen').forEach(s=>s.classList.add('d-none'));
  $(id).classList.remove('d-none');
  // close offcanvas on click (mobile)
  const oc = bootstrap.Offcanvas.getOrCreateInstance('#rightMenu');
  oc.hide();
}

function setupNav(){
  $$('#rightMenu [data-nav]').forEach(a=>{
    a.addEventListener('click', (e)=>{
      e.preventDefault();
      $$('#rightMenu .list-group-item').forEach(x=>x.classList.remove('active'));
      a.classList.add('active');
      showScreen('#'+a.dataset.nav);
    });
  });
}

// ===== Settings handlers =====
function setupSettings(){
  $('#apiInput').value = getApiUrl();
  $('#saveApi').addEventListener('click', ()=>{
    const u = $('#apiInput').value.trim();
    if(!u){ alert('Provide Apps Script URL'); return; }
    setApiUrl(u);
    loadJSON().catch(err=>$('#hint').textContent = 'ERROR: '+err.message);
  });
}

// ===== Events =====
document.addEventListener('DOMContentLoaded', ()=>{
  // Desktop refresh
  $('#btnRefresh').addEventListener('click', ()=>applyFilters(false));
  // Mobile refresh
  $('#btnRefresh_m').addEventListener('click', ()=>applyFilters(true));

  setupNav();
  setupSettings();
  // initial
  loadJSON().catch(err=>$('#hint').textContent = 'ERROR: ' + err.message);
});
