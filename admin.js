// ===== Guard & header =====
Auth.requireSuper();
const A = Auth.get();
document.getElementById('who').textContent = `${A.user_name} • ${A.user_type||''}`;
document.getElementById('av').textContent = (A.user_name||'SU').slice(0,2).toUpperCase();
document.getElementById('toggle').onclick = ()=> document.body.classList.toggle('c');

// ===== Loader & Toast =====
const LO = { el: document.getElementById('loader'), show(){this.el.classList.add('show')}, hide(){this.el.classList.remove('show')} };
const Toast = { el:document.getElementById('toast'), show(t){ this.el.textContent=t; this.el.style.display='block'; clearTimeout(this._t); this._t=setTimeout(()=>this.hide(),2200); }, hide(){ this.el.style.display='none'; } };

// ===== Simple ECharts demo on dashboard =====
(function charts(){
  const bar = echarts.init(document.getElementById('bar'));
  bar.setOption({
    legend:{data:['Online','Offline']}, grid:{left:30,right:10,top:30,bottom:30},
    xAxis:{type:'category',data:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec']},
    yAxis:{type:'value'},
    series:[
      {name:'Online', type:'bar', data:[45,78,22,60,50,48,30,65,70,58,20,32]},
      {name:'Offline', type:'bar', data:[58,62,35,95,72,90,48,82,79,88,35,40]}
    ]
  });
  const pie = echarts.init(document.getElementById('pie'));
  pie.setOption({ series:[{type:'pie',radius:['40%','70%'],data:[
    {value:35,name:'USA'},{value:22,name:'India'},{value:10,name:'UK'},{value:14,name:'France'},{value:19,name:'Brazil'}
  ]}]});
  addEventListener('resize', ()=>{ bar.resize(); pie.resize(); });
})();

// ===== API helpers =====
const API_BASE = localStorage.getItem("API_BASE")
  || "https://script.google.com/macros/s/AKfycbwnxRudS_il7Dvcdh7-QB36NJaP-6-hl5nMniXrbuKhMpHPK8CCEGkRIc9-okB-P0Z6Zw/exec";

const API = {
  async list(route, params={}){
    const usp = new URLSearchParams({ api:'1', route, op:'list', limit: String(params.limit||500), offset: String(params.offset||0) });
    for(const [k,v] of Object.entries(params.filters||{})){ if(v!=='' && v!=null) usp.append(k, v); }
    const url = API_BASE + (API_BASE.includes('?')?'&':'?') + usp.toString();
    const r = await fetch(url, {cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  },
  async upsert(route, payload){
    const url = API_BASE + (API_BASE.includes('?')?'&':'?') + `api=1&route=${route}&op=upsert`;
    const r = await fetch(url, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)});
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  },
  async del(route, idField, id){
    const url = API_BASE + (API_BASE.includes('?')?'&':'?') + `api=1&route=${route}&op=delete&${idField}=${encodeURIComponent(id)}`;
    const r = await fetch(url, {method:"POST"});
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }
};

// ===== Table meta (idField + fields) =====
const META = {
  users: {
    title: "អ្នកប្រើប្រាស់",
    idField: "user_id",
    listCols: ["user_id","user_name","user_type","user_root","department_id"],
    fields: [
      {field:"user_name", label:"ឈ្មោះ", required:true},
      {field:"user_pass", label:"ពាក្យសម្ងាត់", type:"password"}, // ទុកទទេពេលកែ ដើម្បីរក្សាទុកចាស់
      {field:"user_type", label:"ប្រភេទ", type:"select", options:["superuser","admin","user"]},
      {field:"user_root", label:"សិទ្ធិ", type:"select", options:["read","write","all"]},
      {field:"department_id", label:"នាយកដ្ឋាន", type:"select-remote", from:"departments", valueField:"department_id", textField:"department_name"}
    ]
  },
  departments: {
    title: "Departments",
    idField: "department_id",
    listCols: ["department_id","department_name"],
    fields: [
      {field:"department_name", label:"ឈ្មោះនាយកដ្ឋាន", required:true}
    ]
  },
  units: {
    title: "Units",
    idField: "unit_id",
    listCols: ["unit_id","unit_name","department_id"],
    fields: [
      {field:"department_id", label:"នាយកដ្ឋាន", type:"select-remote", from:"departments", valueField:"department_id", textField:"department_name", required:true},
      {field:"unit_name", label:"ឈ្មោះផ្នែក/អង្គភាព", required:true}
    ]
  },
  periods: {
    title: "Periods",
    idField: "period_id",
    listCols: ["period_id","period_name","year","month"],
    fields: [
      {field:"period_name", label:"ឈ្មោះកាលបរិច្ឆេទ", required:true},
      {field:"year", label:"ឆ្នាំ", type:"number", required:true},
      {field:"month", label:"ខែ (1-12)", type:"number"}
    ]
  },
  indicators: {
    title: "Indicators",
    idField: "indicator_id",
    listCols: ["indicator_id","indicator_name","indicator_type","department_id"],
    fields: [
      {field:"indicator_name", label:"ឈ្មោះសូចនាករ", required:true},
      {field:"indicator_type", label:"ប្រភេទ", placeholder:"Immunization/Hospital/..."},
      {field:"department_id", label:"នាយកដ្ឋាន", type:"select-remote", from:"departments", valueField:"department_id", textField:"department_name"}
    ]
  }
};

// ===== Secondary data cache for select-remote =====
const Cache = {
  _mem:{},
  async get(route){
    if(this._mem[route]) return this._mem[route];
    const j = await API.list(route, {limit:1000});
    this._mem[route] = j.rows || [];
    return this._mem[route];
  },
  clear(){ this._mem = {}; }
};

// ===== Generic CRUD renderer =====
const CRUD = {
  state: { route:null, rows:[], total:0, q:"" },
  els: {
    secDash: document.getElementById('dashboard-sec'),
    secCrud: document.getElementById('crud-sec'),
    title: document.getElementById('crud-title'),
    total: document.getElementById('crud-total'),
    thead: document.getElementById('thead'),
    tbody: document.getElementById('tbody'),
    q: document.getElementById('crud-q'),
    add: document.getElementById('btn-add')
  },
  show(route){ this.state.route = route; this.els.secDash.style.display='none'; this.els.secCrud.style.display='block'; this.load(); },
  async load(){
    const {route} = this.state; const meta = META[route]; if(!meta) return;
    this.els.title.textContent = meta.title;
    LO.show();
    try{
      const j = await API.list(route, {limit:1000});
      this.state.rows = j.rows||[]; this.state.total = j.total||this.state.rows.length;
      this.renderTable();
      this.els.total.textContent = this.state.total;
    }catch(e){ Toast.show('អានទិន្នន័យបរាជ័យ'); }
    LO.hide();
  },
  renderTable(){
    const {route, rows} = this.state; const meta = META[route];
    // header
    const cols = meta.listCols;
    this.els.thead.innerHTML = `<tr>${cols.map(c=>`<th>${c}</th>`).join('')}<th style="width:120px">សកម្មភាព</th></tr>`;
    // filter by q
    const q = (this.els.q.value||'').toLowerCase();
    const view = rows.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
    // body
    this.els.tbody.innerHTML = view.map(r=>{
      const tds = cols.map(c=>`<td>${r[c]??""}</td>`).join('');
      return `<tr>${tds}
        <td>
          <button class="btn" data-act="edit" data-id="${r[meta.idField]}"><i class="ri-pencil-line"></i></button>
          <button class="btn danger" data-act="del" data-id="${r[meta.idField]}"><i class="ri-delete-bin-6-line"></i></button>
        </td></tr>`;
    }).join('') || `<tr><td colspan="${cols.length+1}" class="muted">មិនមានទិន្នន័យ</td></tr>`;
  },
  getById(id){ const meta=META[this.state.route]; return this.state.rows.find(r=>String(r[meta.idField])===String(id)); }
};
CRUD.els.q.addEventListener('input', ()=>CRUD.renderTable());
CRUD.els.add.onclick = ()=> Dlg.openNew(CRUD.state.route);
CRUD.els.tbody.addEventListener('click', (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  const act = btn.dataset.act, id = btn.dataset.id;
  if(act==='edit') Dlg.openEdit(CRUD.state.route, CRUD.getById(id));
  if(act==='del') ConfirmDelete(CRUD.state.route, id);
});

// ===== Dialog (add/edit) =====
const Dlg = {
  el: document.getElementById('dlg'),
  form: document.getElementById('dlg-form'),
  body: document.getElementById('dlg-body'),
  title: document.getElementById('dlg-title'),
  mode: 'new',  // or edit
  route: null,
  record: null,
  async openNew(route){ this.mode='new'; this.route=route; this.record=null; this.render(); this.el.showModal(); },
  async openEdit(route, rec){ this.mode='edit'; this.route=route; this.record=rec; this.render(); this.el.showModal(); },
  async render(){
    const meta = META[this.route];
    this.title.textContent = (this.mode==='new'?'បន្ថែម ':'កែប្រែ ') + meta.title;
    // build fields
    const rec = this.record || {};
    const rows = await Promise.all(meta.fields.map(async f=>{
      let input = '';
      if(f.type==='select'){
        input = `<select class="m-ipt" name="${f.field}">`
              + f.options.map(o=>`<option value="${o}" ${rec[f.field]==o?'selected':''}>${o}</option>`).join('')
              + `</select>`;
      } else if(f.type==='select-remote'){
        const list = await Cache.get(f.from);
        input = `<select class="m-ipt" name="${f.field}">
          <option value="">—</option>
          ${list.map(x=>`<option value="${x[f.valueField]}"`
             + (String(rec[f.field||''])===String(x[f.valueField])?' selected':'')
             + `>${x[f.textField]}</option>`).join('')}
        </select>`;
      } else if(f.type==='number'){
        input = `<input class="m-ipt" type="number" name="${f.field}" value="${rec[f.field]??''}" ${f.placeholder?`placeholder="${f.placeholder}"`:''}>`;
      } else if(f.type==='password'){
        input = `<input class="m-ipt" type="password" name="${f.field}" value="" placeholder="${this.mode==='edit'?'ទុកទទេ ប្រសិនបើមិនប្តូរ':''}">`;
      } else {
        input = `<input class="m-ipt" name="${f.field}" value="${rec[f.field]??''}" ${f.placeholder?`placeholder="${f.placeholder}"`:''}>`;
      }
      const req = f.required?`<span style="color:#ef4444">*</span>`:'';
      return `<div class="m-row"><label>${f.label} ${req}</label>${input}</div>`;
    }));
    this.body.innerHTML = rows.join('');
    // attach submit
    this.form.onsubmit = async (e)=>{
      e.preventDefault();
      const data = Object.fromEntries(new FormData(this.form).entries());
      // cleanup numbers and empty passwords
      for(const f of META[this.route].fields){
        if(f.type==='number' && data[f.field]!=='' ) data[f.field] = Number(data[f.field]);
        if(f.type==='password' && this.mode==='edit' && !data[f.field]) delete data[f.field];
        if(data[f.field]==='') delete data[f.field];
      }
      // id for edit
      if(this.mode==='edit'){
        const idField = META[this.route].idField;
        data[idField] = this.record[idField];
      }
      try{
        LO.show();
        await API.upsert(this.route, data);
        Toast.show('រក្សាទុកសម្រេច');
        this.close();
        Cache.clear();
        await CRUD.load();
      }catch(err){
        Toast.show('រក្សាទុកបរាជ័យ');
      }finally{ LO.hide(); }
    };
  },
  close(){ this.el.close(); this.form.reset(); }
};

// ===== Delete confirm =====
async function ConfirmDelete(route, id){
  const meta = META[route];
  if(!confirm('តើលុបមែនទេ?')) return;
  try{
    LO.show();
    await API.del(route, meta.idField, id);
    Toast.show('បានលុប');
    await CRUD.load();
  }catch(err){ Toast.show('លុបបរាជ័យ'); }
  LO.hide();
}
  reports: {
    title: "របាយការណ៍",
    idField: "report_id",
    listCols: ["report_id","indicator_id","period_id","value","plan_value"],
    fields: [
      {field:"indicator_id", label:"សូចនាករ", type:"select-remote", from:"indicators", valueField:"indicator_id", textField:"indicator_name", required:true},
      {field:"period_id",    label:"កាលបរិច្ឆេទ (Period)", type:"select-remote", from:"periods", valueField:"period_id", textField:"period_name", required:true},
      {field:"value",        label:"តម្លៃពិត", type:"number", required:true},
      {field:"plan_value",   label:"ផែនការ", type:"number"}
    ]
  }


// ===== Menu navigation =====
function filterMenu(q){
  q=(q||'').toLowerCase();
  document.querySelectorAll('#menu .item').forEach(a=>{
    a.style.display = a.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}
document.getElementById('menu').addEventListener('click', async (e)=>{
  const a = e.target.closest('a.item'); if(!a) return;
  e.preventDefault();
  document.querySelectorAll('#menu .item').forEach(x=>x.classList.remove('active'));
  a.classList.add('active');
  const hash = a.getAttribute('href') || '#dashboard';
  if(hash==='#dashboard'){
    document.getElementById('crud-sec').style.display='none';
    document.getElementById('dashboard-sec').style.display='block';
    return;
  }
  const route = hash.slice(1);
  CRUD.show(route);
});

// ===== Dashboard metrics =====
(async function metrics(){
  LO.show();
  try{
    const [u,d,un,i] = await Promise.all([
      API.list('users',{limit:1}), API.list('departments',{limit:1}), API.list('units',{limit:1}), API.list('indicators',{limit:1})
    ]);
    document.getElementById('m_users').textContent = u.total ?? u.rows?.length ?? '—';
    document.getElementById('m_deps').textContent  = d.total ?? d.rows?.length ?? '—';
    document.getElementById('m_units').textContent = un.total ?? un.rows?.length ?? '—';
    document.getElementById('m_inds').textContent  = i.total ?? i.rows?.length ?? '—';
  }catch(e){ /* ignore */ }
  LO.hide();
})();
