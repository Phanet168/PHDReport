const $ = (id) => document.getElementById(id);

let barChart, allRows = [], periods = [], orgs = [];

async function loadJSON(){
  const hint = $('hint');
  hint.textContent = 'Loading…';
  const res = await fetch(window.APPSCRIPT_URL, { cache: 'no-store' });
  if(!res.ok) throw new Error('API error '+res.status);
  const data = await res.json();

  allRows = (data.report_values || []).map(r => ({
    org_unit_id: String(r.org_unit_id||'').trim(),
    org_type: String(r.org_type||'').trim(),
    period_id: String(r.period_id||'').trim(),
    indicator_id: String(r.indicator_id||'').trim(),
    age_group: String(r.age_group||'').trim(),
    sex: String(r.sex||'').trim(),
    icd10_code: String(r.icd10_code||'').trim(),
    value_num: Number(r.value_num||r.value||0),
    source_note: String(r.source_note||'').trim()
  }));

  periods = Array.from(new Set(allRows.map(r=>r.period_id))).filter(Boolean).sort().reverse();
  orgs = Array.from(new Set(allRows.map(r=>r.org_unit_id))).filter(Boolean).sort();

  $('per').innerHTML = periods.map(p=>`<option>${p}</option>`).join('');
  $('org').innerHTML = '<option value="">All</option>' + orgs.map(o=>`<option>${o}</option>`).join('');

  hint.textContent = `Loaded ${allRows.length} rows`;
}

function applyFilters(){
  const per = $('per').value;
  const orgType = $('orgType').value;
  const org = $('org').value;

  let rows = allRows;
  if (per) rows = rows.filter(r=>r.period_id===per);
  if (orgType) rows = rows.filter(r=>r.org_type===orgType);
  if (org) rows = rows.filter(r=>r.org_unit_id===org);

  // KPIs
  let deaths=0, disch=0, opd=0, ipd=0;
  const sums = {};
  for(const r of rows){
    const v = r.value_num||0;
    sums[r.indicator_id] = (sums[r.indicator_id]||0)+v;
    if(r.indicator_id==='IPD_003') deaths+=v;
    if(r.indicator_id==='IPD_002') disch+=v;
    if(r.indicator_id==='OPD_REF') opd+=v;
    if(r.indicator_id==='IPD_REF') ipd+=v;
  }
  const rate = disch ? Math.round(10000*deaths/disch)/100 : 0;
  $('kpiMort').textContent = `${deaths} / ${disch} → ${rate}%`;
  $('kpiRef').textContent = `OPD ${opd} • IPD ${ipd}`;
  const top = Object.entries(sums).sort((a,b)=>b[1]-a[1])[0];
  $('kpiTop').textContent = top ? `${top[0]}: ${top[1]}` : '—';
  $('hint').textContent = `Showing ${rows.length} rows • ${org||'All'} ${orgType||''} @ ${per||'latest'}`;

  // Chart Top 10
  const top10 = Object.entries(sums).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const labels = top10.map(x=>x[0]); const vals = top10.map(x=>x[1]);
  const ctx = document.getElementById('barTop').getContext('2d');
  if(!barChart){
    barChart = new Chart(ctx, { type:'bar', data:{labels, datasets:[{label:'Total', data:vals}]},
      options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{maxRotation:45}}}}});
  } else {
    barChart.data.labels = labels; barChart.data.datasets[0].data = vals; barChart.update();
  }

  // Table
  renderTable(rows.slice(0,500)); // cap 500 rows for speed
}

function renderTable(rows){
  const cols = ['org_unit_id','org_type','period_id','indicator_id','age_group','sex','icd10_code','value_num','source_note'];
  let html = '<table><thead><tr>'+cols.map(c=>`<th>${c}</th>`).join('')+'</tr></thead><tbody>';
  for(const r of rows){ html += '<tr>'+cols.map(c=>`<td>${r[c]??''}</td>`).join('')+'</tr>'; }
  html += '</tbody></table>';
  $('tblWrap').innerHTML = html;
}

// Init
document.getElementById('btnRefresh').addEventListener('click', applyFilters);
(async()=>{ await loadJSON(); $('per').value = (periods[0]||''); applyFilters(); })();
