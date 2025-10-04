// assets/js/pages/home.page.js
// Dashboard Overview (Khmer UI) — Month/Quarter/Half/9M/Year compare
// • Role-aware indicator list (Super = all; others = own dept/unit)
// • Chart: line(ឆ្នាំនេះ, ឆ្នាំមុន) + bar(គោលដៅ)
// • KPI cards: current value, current target, attainment %, YoY %
// • Aggregate toggle: Sum / Avg
// • Year & Indicator come from DB; periods parsed from DB as well.

import { gasList } from '../app.api.firebase.js';
import { getAuth, isSuper } from '../app.auth.js';

export default async function hydrateHome(root){
  // ---------- DOM ----------
  const $  = s => root.querySelector(s);
  const $$ = s => Array.from(root.querySelectorAll(s));

  const segBtns    = $$('.segbtn');             // buttons for period type
  const yearSel    = $('#dashYear');
  const indSel     = $('#dashInd');
  const applyBtn   = $('#dashApply');
  const chartDiv   = $('#chartMain');
  const statusEl   = $('#dashStatus');

  // Optional extras (if present in HTML; safe to ignore if missing)
  const aggSumBtn  = $('#aggSum');
  const aggAvgBtn  = $('#aggAvg');
  const btnSavePng = $('#btnSavePng');

  // KPI cards (optional)
  const kpiCur     = $('#kpiCur');
  const kpiCurLb   = $('#kpiCurLabel');
  const kpiTar     = $('#kpiTar');
  const kpiAtt     = $('#kpiAttain');
  const kpiAttH    = $('#kpiAttainHint');
  const kpiYoY     = $('#kpiYoY');
  const lastUpd    = $('#lastUpdated');

  // NEW (optional Issue cards; safe no-op if HTML not present)
  const kpiIssueAll    = $('#kpiIssueAll');
  const kpiIssueSolved = $('#kpiIssueSolved');
  const kpiIssueOpen   = $('#kpiIssueOpen');

  // ---------- State ----------
  const KH_MONTHS=['មករា','កុម្ភៈ','មិនា','មេសា','ឧសភា','មិថុនា','កក្កដា','សីហា','កញ្ញា','តុលា','វិច្ឆិកា','ធ្នូ'];
  let MODE = 'M';    // M | Q | H | N9 | Y12
  let AGG  = 'sum';  // 'sum' | 'avg'
  let chart = null;

  // ---------- Utils ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const isNum = v => Number.isFinite(+v);
  const pad2  = n => String(n).padStart(2,'0');
  const fmtNum = v => (v==null || v==='') ? '—' : (Number(v).toLocaleString('km-KH'));

  // Parse period code from records (reports/targets/etc):
  // accept {period_id:"2024-09"} or {year:2024, month:"M09"/"Q1"/"H2"/"Y12"} or {tag:"M09"...}
  function parsePeriod(rec){
    const pid = String(rec.period_id ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(pid)) {
      return { y:+pid.slice(0,4), t:'M'+pid.slice(5,7) };
    }
    const y = rec.year ? +rec.year : undefined;
    const t = String(rec.month ?? rec.tag ?? '').toUpperCase();
    if (y && t) return { y, t };
    return { y: undefined, t: '' };
  }

  // Robust parser just for actions rows (supports many schemas)
  function parseActionPeriod(a){
    // 1) period_id variants first
    const pid = String(a.period_id ?? a.action_period_id ?? a.periodid ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(pid)) return { y: +pid.slice(0,4), t: 'M'+pid.slice(5,7) };
    if (/^\d{4}M\d{2}$/i.test(pid)) return { y: +pid.slice(0,4), t: 'M'+pid.slice(5,7) };

    // 2) explicit fields (action_year, action_tag, etc.)
    let year = a.year ?? a.action_year ?? a.y ?? a.fy;
    let tag  = a.tag  ?? a.month ?? a.action_tag ?? a.period ?? a.p ?? a.period_code;
    if (typeof year === 'string' && /^\d{4}$/.test(year)) year = +year;

    // normalize tag like "10" -> "M10"
    if (tag != null) {
      let T = String(tag).trim().toUpperCase();
      if (/^\d{1,2}$/.test(T)) T = 'M'+String(+T).padStart(2,'0');
      if (/^M\d{2}$/.test(T) || /^Q[1-4]$/.test(T) || /^H[12]$/.test(T) || T==='N9' || T==='Y12') {
        if (Number.isFinite(year)) return { y:+year, t:T };
      }
    }

    // 3) fallback from date/timestamp
    const dt = a.date ?? a.action_date ?? a.created_at ?? a.timestamp;
    if (dt) {
      const d = new Date(dt);
      if (!isNaN(+d)) {
        const y = d.getFullYear();
        const m = d.getMonth()+1;
        return { y, t: 'M'+String(m).padStart(2,'0') };
      }
    }

    // 4) fallback from action_period: "2024-Q3" / "2024-M10"
    const ap = String(a.action_period ?? a.period_text ?? '').toUpperCase();
    const mm = ap.match(/^(\d{4})[-/]?(M\d{2}|Q[1-4]|H[12]|N9|Y12)$/);
    if (mm) return { y:+mm[1], t:mm[2] };

    return { y: undefined, t: '' };
  }

  // Group helpers
  const GROUPS = {
    M: { labels: KH_MONTHS, buckets: 12, mapIdx: t => /^M\d{2}$/.test(t) ? (+t.slice(1)-1) : -1 },
    Q: { labels: ['ត្រី I','ត្រី II','ត្រី III','ត្រី IV'], buckets: 4, mapIdx: t => /^Q[1-4]$/.test(t) ? (+t.slice(1)-1) : -1 },
    H: { labels: ['ឆមាស I','ឆមាស II'], buckets: 2, mapIdx: t => /^H[12]$/.test(t) ? (+t.slice(1)-1) : -1 },
    N9:{ labels: ['៩ខែ'], buckets: 1, mapIdx: t => (t==='N9'?0:-1) },
    Y12:{ labels: ['១២ខែ'], buckets: 1, mapIdx: t => (t==='Y12'?0:-1) }
  };

  function aggValues(monthArr, mode, agg='sum'){
    // monthArr length 12 (M01..M12)
    if (!Array.isArray(monthArr) || monthArr.length !== 12) return [];
    const g=GROUPS[mode];
    if (!g) return [];
    // Build indices per group
    const groups = {
      M: [[0],[1],[2],[3],[4],[5],[6],[7],[8],[9],[10],[11]],
      Q: [[0,1,2],[3,4,5],[6,7,8],[9,10,11]],
      H: [[0,1,2,3,4,5],[6,7,8,9,10,11]],
      N9:[[0,1,2,3,4,5,6,7,8]],
      Y12:[[0,1,2,3,4,5,6,7,8,9,10,11]],
    }[mode];

    const out=[];
    for (const idxs of groups){
      const vals = idxs.map(i => {
        const v = Number(monthArr[i]);
        return Number.isFinite(v) ? v : null;
      }).filter(v => v!=null);
      if (!vals.length) { out.push(null); continue; }
      out.push(agg==='avg' ? vals.reduce((a,b)=>a+b,0)/vals.length : vals.reduce((a,b)=>a+b,0));
    }
    return out;
  }

  function fillYearsFromDB(periods){
    // Collect distinct years from any period row
    const years = new Set();
    for (const p of (periods||[])){
      // try explicit year
      if (p.year) years.add(+p.year);
      // parse period_id YYYY-XX
      const pid = String(p.period_id || '').trim();
      if (/^\d{4}-\d{2}$/.test(pid)) years.add(+pid.slice(0,4));
    }
    // fallback: this year
    if (!years.size) years.add(new Date().getFullYear());

    const arr=[...years].sort((a,b)=>b-a);
    yearSel.innerHTML = arr.map(y=>`<option value="${y}">${y}</option>`).join('');
    // default to newest
    yearSel.value = arr[0];
  }

  function filterIndicatorsByAuth(allIndicators, units, depts){
    const auth = getAuth?.() || {};
    if (isSuper?.()) return allIndicators;

    // If not super: show their own indicators (same dept or same unit)
    const myDept = String(auth.department_id ?? auth.dept_id ?? '');
    const myUnit = String(auth.unit_id ?? '');
    return (allIndicators||[]).filter(it=>{
      const depOk = !myDept || String(it.department_id ?? '') === myDept;
      const uniOk = !myUnit || String(it.unit_id ?? '') === myUnit;
      // If both present → AND; if only one present → that one
      if (myDept && myUnit) return depOk && uniOk;
      return depOk || uniOk;
    });
  }

  function fillIndicatorSelectGrouped(selectEl, indicators, deptMeta, unitMeta){
    // detect simple mode from HTML attributes
    const SIMPLE = selectEl?.dataset?.simple === '1';
    const TEXT_MODE = (selectEl?.dataset?.text || 'both').toLowerCase(); // 'name' | 'code' | 'both'

    const makeText = (r)=>{
      const code = r.indicator_code || r.indicator_id || '';
      const name = r.indicator_name || '';
      if (TEXT_MODE === 'name') return String(name || code || '');
      if (TEXT_MODE === 'code') return String(code || name || '');
      // both (default): show name (code can be added if needed)
      return code ? `${name}` : String(name || '');
    };

    // SIMPLE: render flat list of indicators only
    if (SIMPLE) {
      const rows = (indicators||[]).slice().sort((a,b)=>{
        const ta = makeText(a), tb = makeText(b);
        return String(ta).localeCompare(String(tb), 'km-KH', {numeric:true, sensitivity:'base'});
      });
      selectEl.innerHTML = rows.map(r => {
        const id = esc(String(r.indicator_id));
        const text = esc(makeText(r));
        return `<option value="${id}">${text}</option>`;
      }).join('');
      if (!selectEl.value){
        const first = selectEl.querySelector('option');
        if (first) first.selected = true;
      }
      return; // done
    }

    // ====== Legacy (grouped by dept/unit) ======
    // group: dep|unit -> indicators
    const groups = new Map();
    for (const it of (indicators||[])) {
      const depId  = String(it.department_id ?? '');
      theUnitId: {
        const unitId = String(it.unit_id ?? '');
        const key = depId + '|' + unitId;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(it);
      }
    }

    // sort groups by dept code -> unit code
    const sortedKeys = [...groups.keys()].sort((a,b)=>{
      const [da,ua] = a.split('|'); const [db,ub] = b.split('|');
      const d1=(deptMeta[da]?.code||da), d2=(deptMeta[db]?.code||db);
      if (String(d1)!==String(d2)) return String(d1).localeCompare(String(d2),'km-KH',{numeric:true,sensitivity:'base'});
      const u1=(unitMeta[ua]?.code||ua), u2=(unitMeta[ub]?.code||ub);
      return String(u1).localeCompare(String(u2),'km-KH',{numeric:true,sensitivity:'base'});
    });

    const parts=[];
    for (const key of sortedKeys){
      const [depId, unitId] = key.split('|');
      const depName  = deptMeta[depId]?.name  || '(គ្មានជំពូក)';
      const unitName = unitMeta[unitId]?.name || '(គ្មានផ្នែក)';
      const label = `${depName} / ${unitName}`;

      const rows = groups.get(key) || [];
      rows.sort((a,b)=>{
        const ta = makeText(a), tb = makeText(b);
        return String(ta).localeCompare(String(tb),'km-KH',{numeric:true,sensitivity:'base'});
      });

      parts.push(
        `<optgroup label="${esc(label)}">` +
        rows.map(r=>{
          const id = esc(String(r.indicator_id));
          const text = esc(makeText(r));
          return `<option value="${id}">${text}</option>`;
        }).join('') +
        `</optgroup>`
      );
    }
    selectEl.innerHTML = parts.join('');
    if (!selectEl.value){
      const first = selectEl.querySelector('option');
      if (first) first.selected = true;
    }
  }

  // ---------- Fetch base data ----------
  const [indicatorsAll, reportsRaw, targetsRaw, periodsRaw, units, depts, actionsRaw] = await Promise.all([
    gasList('indicators').catch(()=>[]),
    gasList('reports').catch(()=>[]),     // values by period
    gasList('targets').catch(()=>[]),     // monthly target (M01..M12) or annual
    gasList('periods').catch(()=>[]),     // to collect available years
    gasList('units').catch(()=>[]),
    gasList('departments').catch(()=>[]),
    gasList('actions').catch(()=>[]),     // actions for issues KPI
  ]);

  // (optional) quick debug to verify parsed action periods
  try{
    if (Array.isArray(actionsRaw) && actionsRaw.length){
      const sample = actionsRaw.slice(0,5).map(a=>({indicator_id:a.indicator_id, p:parseActionPeriod(a)}));
      // console.log('[home] actions sample periods:', sample);
    }
  }catch(_){}

  // Meta maps
  const unitMeta = Object.fromEntries((units||[]).map(u => [String(u.unit_id), {
    name: u.unit_name || ('Unit '+u.unit_id),
    code: u.unit_code || u.code || String(u.unit_id)
  }]));
  const deptMeta = Object.fromEntries((depts||[]).map(d => [String(d.department_id), {
    name: d.department_name || ('Dept '+d.department_id),
    code: d.department_code || d.code || String(d.department_id)
  }]));

  // Role-aware indicator list
  const indicators = filterIndicatorsByAuth(indicatorsAll, units, depts);

  // Fill year & indicator
  fillYearsFromDB(periodsRaw.length ? periodsRaw : reportsRaw);
  fillIndicatorSelectGrouped(indSel, indicators, deptMeta, unitMeta);

  // ---------- Chart ----------
  chart = initChart(chartDiv);

  function initChart(div){
    const echarts = window.echarts;
    const inst = echarts.init(div);
    inst.setOption({
      grid:{ left:56, right:18, top:36, bottom:44 },
      tooltip:{
        trigger:'axis',
        formatter(params){
          const title = params[0]?.axisValueLabel || '';
          const lines = params.map(p=>`${p.marker} ${p.seriesName}: <b>${fmtNum(p.value)}</b>`);
          return `<div style="min-width:180px">${title}<br>`.concat(lines.join('<br>'),'</div>');
        }
      },
      legend:{ top:0, data:['ឆ្នាំនេះ','ឆ្នាំមុន','គោលដៅ'] },
      xAxis:{ type:'category', data:[], axisLabel:{ interval:0 }},
      yAxis:{ type:'value', name:'តម្លៃ', nameGap:16, splitLine:{show:true} },
      series:[
        { name:'ឆ្នាំនេះ', type:'line', smooth:true, symbol:'circle', symbolSize:6, areaStyle:{opacity:.08}, data:[] },
        { name:'ឆ្នាំមុន', type:'line', smooth:true, symbol:'circle', symbolSize:6, lineStyle:{type:'dashed'}, data:[] },
        { name:'គោលដៅ', type:'bar',  barMaxWidth:28, data:[] }
      ]
    });
    return inst;
  }

  // ---------- Data extractors ----------
  function monthlyValuesFor(indId, year){
    // return array[12] (Jan..Dec) numbers or null
    const out = new Array(12).fill(null);
    for (const r of (reportsRaw||[])){
      if (String(r.indicator_id)!==String(indId)) continue;
      const {y,t} = parsePeriod(r);
      if (y !== +year) continue;
      if (/^M\d{2}$/.test(t)) {
        const mi = +t.slice(1)-1;
        const v = +(r.value ?? r.indicator_value ?? r.val ?? r.num);
        if (Number.isFinite(v)) out[mi] = v;
      }
    }
    return out;
  }

  function monthlyTargetFor(indId, year){
    // 1) Prefer explicit monthly fields (M01..M12)
    const row = (targetsRaw||[]).find(t => String(t.indicator_id)===String(indId) && String(t.year)===String(year));
    if (row){
      const arr = new Array(12).fill(null);
      let hasMonthly = false;
      for (let m=1;m<=12;m++){
        const key='M'+pad2(m);
        const v = +(row[key] ?? row[key.toLowerCase()]);
        if (Number.isFinite(v)) { arr[m-1] = v; hasMonthly = true; }
      }
      if (hasMonthly) return arr;

      // 2) Else if annual present → spread evenly
      const annual = +(row.target_value ?? row.target ?? row.annual_target);
      if (Number.isFinite(annual)) {
        const per = annual / 12;
        return new Array(12).fill(per);
      }
    }
    // 3) Try from reports table 'target' per month (if exists)
    const arr = new Array(12).fill(null);
    let any = false;
    for (const r of (reportsRaw||[])){
      if (String(r.indicator_id)!==String(indId)) continue;
      const {y,t} = parsePeriod(r);
      if (y !== +year) continue;
      if (/^M\d{2}$/.test(t)) {
        const mi = +t.slice(1)-1;
        const v = +(r.target ?? r.target_value);
        if (Number.isFinite(v)) { arr[mi] = v; any = true; }
      }
    }
    if (any) return arr;

    // 4) default: no target
    return new Array(12).fill(null);
  }

  // ---------- Issue helpers (NEW; safe if actionsRaw missing) ----------
  function isResolved(a){
    const done = a?.done ?? a?.completed ?? a?.resolved ?? a?.action_done;
    if (done === true || done === 'true' || done === 1 || done === '1') return true;

    const prog = Number(a?.progress ?? a?.percent ?? a?.attainment);
    if (Number.isFinite(prog) && prog >= 100) return true;

    const sRaw = a?.status ?? a?.action_status ?? a?.state ?? a?.flag;
    const s = String(sRaw ?? '').toLowerCase();
    if (/(resolved|closed|done|complete|completed|fixed|finish|finished)/.test(s)) return true;
    if (s==='1' || s==='true' || s==='yes') return true;

    const sKh = String(sRaw ?? '').trim();
    if (/បានដោះស្រាយ|បិទរួច|សម្រេច|រួចរាល់/.test(sKh)) return true;

    return false;
  }
  function tagToMonthIndex(tag){
    if (!tag) return null;
    if (/^M\d{2}$/.test(tag)) return (+tag.slice(1)-1);
    if (/^Q[1-4]$/.test(tag)) return ({Q1:2, Q2:5, Q3:8, Q4:11}[tag]);
    if (/^H[12]$/.test(tag)) return ({H1:5, H2:11}[tag]);
    if (tag==='N9')  return 8;
    if (tag==='Y12') return 11;
    return null;
  }
  function issueCountsFor(indId, year, bucketIdx){
    if (!Array.isArray(actionsRaw) || !actionsRaw.length) return { total:0, solved:0, open:0 };
    let total=0, solved=0;
    for (const a of actionsRaw){
      if (String(a.indicator_id)!==String(indId)) continue;
      const { y, t } = parseActionPeriod(a);  // <<— robust parser for actions
      if (+y !== +year || !t) continue;
      const mi = tagToMonthIndex(t);
      if (mi==null || mi>bucketIdx) continue;
      total++;
      if (isResolved(a)) solved++;
    }
    return { total, solved, open: Math.max(0, total - solved) };
  }

  // ---------- Refresh ----------
  async function refreshChart(){
    const year = +yearSel.value;
    const indId = indSel.value;

    // labels by MODE
    const labels = GROUPS[MODE].labels;

    // current & previous years (monthly 12 values)
    const curM = monthlyValuesFor(indId, year);
    const preM = monthlyValuesFor(indId, year-1);

    // targets
    const tMonthly = monthlyTargetFor(indId, year);

    // aggregate to MODE
    const cur = aggValues(curM, MODE, AGG);
    const pre = aggValues(preM, MODE, AGG);
    const tar = (()=>{
      // For chart target: show as sum (or avg for M mode just redundant)
      // Using SUM for groups makes sense for cumulative indicators.
      // If you want "point target" at period end, swap to AGG.
      const series = aggValues(tMonthly, MODE, 'sum');
      return series;
    })();

    // Chart set
    chart.setOption({
      xAxis: { data: labels },
      series: [
        { name:'ឆ្នាំនេះ', data: cur },
        { name:'ឆ្នាំមុន', data: pre },
        { name:'គោលដៅ', data: tar },
      ]
    });

    // KPI (for month mode show the current month; for others, show last bucket)
    const now = new Date();
    let idxForKpi = (MODE==='M' && year===now.getFullYear()) ? now.getMonth() : (GROUPS[MODE].buckets-1);
    idxForKpi = Math.max(0, Math.min(idxForKpi, GROUPS[MODE].buckets-1));

    const curVal = cur[idxForKpi];
    const tarVal = tar[idxForKpi];
    const preVal = pre[idxForKpi];

    if (kpiCur)   kpiCur.textContent   = fmtNum(curVal);
    if (kpiCurLb) kpiCurLb.textContent = (MODE==='M' ? ('ខែ '+(KH_MONTHS[idxForKpi]||'—')) : labels[idxForKpi]);
    if (kpiTar)   kpiTar.textContent   = fmtNum(tarVal);

    if (kpiAtt){
      const pct = (isNum(curVal) && isNum(tarVal) && tarVal>0) ? (curVal/tarVal*100) : null;
      kpiAtt.textContent = (pct==null) ? '—' : (pct.toFixed(1)+'%');
      if (kpiAttH){
        kpiAttH.innerHTML = (pct==null) ? '' : (pct>=100 ? '<span class="text-success">លើសគោលដៅ</span>' : '<span class="text-warning">ក្រោមគោលដៅ</span>');
      }
    }

    if (kpiYoY){
      const yoy = (isNum(curVal) && isNum(preVal) && preVal!==0) ? ((curVal-preVal)/Math.abs(preVal)*100) : null;
      kpiYoY.textContent = (yoy==null) ? '—' : ((yoy>=0?'+':'')+yoy.toFixed(1)+'%');
    }

    // Status text
    if (statusEl){
      const okCur = cur.filter(v=>v!=null).length;
      const okPre = pre.filter(v=>v!=null).length;
      const okTar = tar.filter(v=>v!=null).length;
      statusEl.textContent = `ទិន្នន័យ: ឆ្នាំនេះ ${okCur}/${labels.length}, ឆ្នាំមុន ${okPre}/${labels.length}, គោលដៅ ${okTar}/${labels.length}`;
    }

    // Last updated hint
    if (lastUpd){
      const latest = (reportsRaw||[])
        .filter(r=> String(r.indicator_id)===String(indId))
        .sort((a,b)=> String(b.period_id||'').localeCompare(String(a.period_id||'')) )[0];
      const s = latest?.updated_at || latest?.updatedAt || latest?.timestamp || '';
      lastUpd.textContent = s ? ('បច្ចុប្បន្នភាពចុងក្រោយ៖ ' + new Date(s).toLocaleString('km-KH')) : '—';
    }

    // ----- Issue KPI (Total / Resolved / Open) — NEW -----
    if (kpiIssueAll || kpiIssueSolved || kpiIssueOpen){
      const { total, solved, open } = issueCountsFor(indId, year, idxForKpi);
      if (kpiIssueAll)    kpiIssueAll.textContent    = fmtNum(total);
      if (kpiIssueSolved) kpiIssueSolved.textContent = fmtNum(solved);
      if (kpiIssueOpen)   kpiIssueOpen.textContent   = fmtNum(open);
    }
  }

  // ---------- Events ----------
  segBtns.forEach(b=>{
    if (b.classList.contains('active')) MODE = b.dataset.pt || 'M';
    b.addEventListener('click', ()=>{
      segBtns.forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      MODE = b.dataset.pt || 'M';
      refreshChart();
    }, {passive:true});
  });

  applyBtn?.addEventListener('click', refreshChart, {passive:true});

  aggSumBtn?.addEventListener('click', ()=>{
    aggSumBtn.classList.add('active'); aggAvgBtn?.classList.remove('active');
    AGG='sum'; refreshChart();
  }, {passive:true});

  aggAvgBtn?.addEventListener('click', ()=>{
    aggAvgBtn.classList.add('active'); aggSumBtn?.classList.remove('active');
    AGG='avg'; refreshChart();
  }, {passive:true});

  btnSavePng?.addEventListener('click', ()=>{
    const url = chart.getDataURL({ type:'png', pixelRatio:2, backgroundColor:'#fff' });
    const a = document.createElement('a');
    a.href = url; a.download = 'dashboard.png'; a.click();
  });

  // ---------- First paint ----------
  await refreshChart();

  // ---------- Cleanup ----------
  return ()=>{
    try{ chart?.dispose?.(); }catch(_){}
  };
}

export function getTitle(){ return 'ផ្ទាំងគ្រប់គ្រង | PHD Report'; }
