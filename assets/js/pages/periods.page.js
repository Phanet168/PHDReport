import { getAuth, isSuper } from '../app.auth.js';
import { gasList, gasSave, gasDelete, ID_FIELDS } from '../app.menu.js';

export async function hydrate(root) {
  const host   = root || document;
  const tbody  = host.querySelector('#tblPeriods tbody');
  const selYr  = host.querySelector('#selYear');
  const btnGen = host.querySelector('#btnGenYear');
  const $status = (m)=>{ const el=host.querySelector('#statusPeriods'); if(el) el.textContent=m||''; };

  if (!tbody || !selYr) return;

  const auth  = getAuth();
  const SUPER = isSuper(auth);
  if (!SUPER && btnGen) btnGen.style.display = 'none';

  // skeleton
  tbody.innerHTML = '';
  for (let i=0;i<6;i++){ const tr=document.createElement('tr'); tr.innerHTML='<td colspan="5" class="skel"></td>'; tbody.appendChild(tr); }

  // ปีសម្រាប់ select
  const nowY = new Date().getFullYear();
  if (!selYr.options.length) {
    for (let y=nowY-3; y<=nowY+3; y++) {
      const o=document.createElement('option'); o.value=y; o.textContent=y; selYr.appendChild(o);
    }
    selYr.value = String(nowY);
  }
  let CUR_YEAR = Number(selYr.value||nowY);

  // state
  let ALL = [];

  const yFromPid  = (pid)=> ( /^(\d{4})/.exec(String(pid||'')) || [] )[1] || '';
  const mFromPid  = (pid)=> ( /M(\d{2})$/.exec(String(pid||'')) || [] )[1] || '';
  const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function render(){
    const rows = (ALL||[])
      .filter(r => String(r.year || yFromPid(r.period_id)) === String(CUR_YEAR))
      .sort((a,b)=> String(a.period_id||'').localeCompare(String(b.period_id||'')));

    if (!rows.length){
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">គ្មានទិន្នន័យ</td></tr>`;
      return;
    }
    const frag = document.createDocumentFragment();
    for (const r of rows){
      const yy   = r.year || yFromPid(r.period_id);
      const mm   = r.month || mFromPid(r.period_id);
      const name = r.period_name || (
        mm === 'H1' || mm === 'H2' ? `${mm} ${yy}` :
        /^Q\d$/.test(mm) ? `${mm} ${yy}` :
        mm ? `${mNames[Number(mm)-1]} ${yy}` : `${yy}`
      );
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.period_id || ''}</td>
        <td>${name}</td>
        <td>${yy}</td>
        <td>${(/^Q|H/.test(mm) ? '' : (mm || ''))}</td>
        <td class="td-actions">
          <div class="actions-right">
            ${SUPER ? `<button class="btn btn-sm btn-danger" data-act="del" data-id="${r.period_id}">លុប</button>` : '<span class="text-muted">—</span>'}
          </div>
        </td>`;
      frag.appendChild(tr);
    }
    tbody.innerHTML = '';
    tbody.appendChild(frag);
  }

  async function load(){
    $status('កំពុងផ្ទុកទិន្នន័យ…');
    ALL = await gasList('periods').catch(()=>[]);
    render();
    $status(`បានផ្ទុក ${ALL.length} មុខ (ឆ្នាំ ${CUR_YEAR})`);
  }

  function buildYear(year){
    const out=[];
    for(let m=1;m<=12;m++){
      out.push({ period_id:`${year}M${String(m).padStart(2,'0')}`, period_name:`${mNames[m-1]} ${year}`, year, month:String(m).padStart(2,'0') });
    }
    for(let q=1;q<=4;q++) out.push({ period_id:`${year}Q${q}`, period_name:`Q${q} ${year}`, year, month:`Q${q}` });
    out.push({ period_id:`${year}H1`, period_name:`H1 ${year}`, year, month:'H1' });
    out.push({ period_id:`${year}H2`, period_name:`H2 ${year}`, year, month:'H2' });
    return out;
  }

  // ✅ year filter works on both 'change' and 'input'
  const onYearChange = ()=>{ CUR_YEAR = Number(selYr.value||nowY); render(); };
  selYr.addEventListener('change', onYearChange);
  selYr.addEventListener('input',  onYearChange);

  // delete
  tbody.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-act="del"]'); if(!btn) return;
    const id  = btn.dataset.id;
    if (!id) return;
    if (!confirm(`លុប Period: ${id} ?`)) return;
    try{
      await gasDelete('periods', ID_FIELDS.periods || 'period_id', id);
      ALL = ALL.filter(x=>String(x.period_id)!==String(id));
      render(); $status('លុបរួចរាល់');
    }catch(err){ alert('បរាជ័យលុប: ' + (err?.message||err)); }
  });

  // generate
  btnGen?.addEventListener('click', async ()=>{
    if (!SUPER) return alert('តែ SUPER ប៉ុណ្ណោះ');
    const y = Number(selYr.value||nowY);
    if (!confirm(`បង្កើតរយៈពេលឆ្នាំ ${y} ?`)) return;
    const want = buildYear(y);
    const have = new Set(ALL.map(r=>String(r.period_id)));
    const todo = want.filter(r=>!have.has(String(r.period_id)));
    if (!todo.length) return alert('មានគ្រប់រួចហើយ');

    const old = btnGen.innerHTML; btnGen.disabled=true; btnGen.innerHTML='កំពុងបង្កើត…';
    try{
      await Promise.allSettled(todo.map(r=>gasSave('periods', r)));
      await load();  // reload & render by year
      onYearChange();
      alert('បង្កើតរួចរាល់');
    }catch(err){ alert('បរាជ័យបង្កើត: ' + (err?.message||err)); }
    finally{ btnGen.disabled=false; btnGen.innerHTML=old; }
  });

  await load();
}

export default hydrate;
