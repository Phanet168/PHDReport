<script type="module">
  import { getAuth, isSuper } from './assets/js/app.auth.js';

  // ===== GAS web app =====
  const GAS_BASE = "https://script.google.com/macros/s/AKfycbzUXPrbr-q3zTP1Jg-f8PX34Jjj23jHFuYiCyaKuOEmP4Qwzb1pXdFcnbypEZVigdF4IA/exec";

  // ===== small helpers =====
  const auth = getAuth();
  if (!auth) location.replace('login.html');

  function attachToken(u){ if (auth?.token) u.searchParams.set('token', auth.token); return u; }

  async function gasList(route, params = {}){
    const u = attachToken(new URL(GAS_BASE));
    u.searchParams.set('api','1');
    u.searchParams.set('route', route);
    u.searchParams.set('op','list');
    Object.entries(params).forEach(([k,v])=>{
      if(v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
    });
    const r = await fetch(u, { cache:'no-store' });
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    if(j.error) throw new Error(j.error);
    return Array.isArray(j.rows) ? j.rows : (Array.isArray(j) ? j : []);
  }

  // ===== role-aware dept menu =====
  async function buildDeptMenu(targetUlId = 'deptMenu'){
    const box = document.getElementById(targetUlId);
    if(!box) return;
    box.innerHTML = '<li class="nav-item"><a href="#"><span class="item-name text-muted">កំពុងទាញទិន្នន័យ...</span></a></li>';

    try{
      // 🔒 non-super → ស្នើ departments តែរបស់ខ្លួន
      const deptParams = (!isSuper(auth) && auth?.department_id)
        ? { department_id: auth.department_id }
        : {};
      const depts = await gasList('departments', deptParams);

      if(!depts.length){
        box.innerHTML = '<li class="nav-item"><a href="#"><span class="item-name text-muted">គ្មានទិន្នន័យ</span></a></li>';
        return;
      }

      const chunks = [];
      for (const d of depts){
        // Dept row
        chunks.push(`
          <li class="nav-item">
            <a href="#"><i class="nav-icon i-Building"></i>
              <span class="item-name">${d.department_name}</span>
            </a>
          </li>
        `);

        // Units (always filter by department_id)
        const units = await gasList('units', { department_id: d.department_id });
        if(!units.length){
          chunks.push(`<li class="nav-item">
            <a href="#"><span class="item-name text-muted ps-4">— គ្មានផ្នែក</span></a>
          </li>`);
        }else{
          for (const u of units){
            chunks.push(`
              <li class="nav-item">
                <a href="pages/departments/${d.department_id}/units/${u.unit_id}/index.html">
                  <i class="nav-icon i-Right"></i>
                  <span class="item-name ps-3">${u.unit_name}</span>
                </a>
              </li>
            `);

            <!-- OPTIONAL: បើចង់បង្ហាញសូចនាករចូលក្រោមផ្នែក
            const inds = await gasList('indicators', { department_id: d.department_id, unit_id: u.unit_id });
            inds.forEach(ind=>{
              chunks.push(`
                <li class="nav-item">
                  <a href="pages/indicators/${ind.indicator_id}.html">
                    <span class="item-name ps-5">• ${ind.indicator_name}</span>
                  </a>
                </li>
              `);
            });
            -->
          }
        }
      }

      box.innerHTML = chunks.join('');
    }catch(err){
      box.innerHTML = `<li class="nav-item"><a href="#">
        <span class="item-name text-danger">បរាជ័យ: ${err.message}</span></a></li>`;
    }
  }

  // init
  buildDeptMenu('deptMenu');
</script>
