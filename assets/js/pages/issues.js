// File: pages/issues/index.js  (ឬ pages/issues/issues.js)
// ✅ តំណទៅ assets/js ត្រឹមត្រូវពីទីតាំង pages/issues/
import { gasList, gasDelete, ID_FIELDS } from '../../assets/js/app.menu.js';
import { getAuth, isSuper } from '../../assets/js/app.auth.js';

export async function initIssues(){
  const $ = s => document.querySelector(s);
  const tbody = $('#tblIssues tbody');
  const sumEl = $('#issuesSummary');

  // helper: Khmer month from tag (M01..M12 / Q1 / H1 / Y12)
  const KH_MONTHS = ['មករា','កុម្ភៈ','មិនា','មេសា','ឧសភា','មិថុនា','កក្កដា','សីហា','កញ្ញា','តុលា','វិច្ឆិកា','ធ្នូ'];
  function prettyPeriod(y, tag){
    if (!y || !tag) return '';
    if (/^M\d{2}$/.test(tag)) return `${KH_MONTHS[+tag.slice(1)-1]} ${y}`;
    if (/^Q[1-4]$/.test(tag)) return `ត្រីមាស ${tag.slice(1)} • ${y}`;
    if (/^H[12]$/.test(tag)) return `ឆមាស ${tag.slice(1)} • ${y}`;
    if (tag==='Y12') return `ឆ្នាំ ${y}`;
    return `${y} ${tag}`;
  }

  function statusBadge(a){
    const s = String(a?.action_status||'').toLowerCase();
    // overdue? if due passed and not done
    let overdue = false;
    if (a?.action_due && s!=='done'){
      const d = new Date(a.action_due);
      if (!Number.isNaN(+d) && d < new Date()) overdue = true;
    }
    if (overdue) return { cls:'bg-danger', label:'ហួសកំណត់' };

    if (s==='planned')  return { cls:'bg-secondary',           label:'បានគ្រោង' };
    if (s==='ongoing')  return { cls:'bg-warning text-dark',   label:'កំពុងដំណើរការ' };
    if (s==='done')     return { cls:'bg-success',             label:'បានបញ្ចប់' };
    if (s==='blocked')  return { cls:'bg-danger',              label:'មានឧបសគ្គ' };
    return               { cls:'text-bg-light',                label:'មិនបានកំណត់' };
  }

  try{
    const [actions, indicators, units, depts] = await Promise.all([
      gasList('actions').catch(()=>[]),
      gasList('indicators').catch(()=>[]),
      gasList('units').catch(()=>[]),
      gasList('departments').catch(()=>[]),
    ]);

    const indById   = new Map((indicators||[]).map(i=>[String(i.indicator_id), i]));
    const unitName  = Object.fromEntries((units||[]).map(u=>[String(u.unit_id), u.unit_name]));
    const deptName  = Object.fromEntries((depts||[]).map(d=>[String(d.department_id), d.department_name]));

    const SUPER = isSuper(getAuth());

    if (!actions?.length){
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">គ្មានបញ្ហាប្រឈម និងសកម្មភាព</td></tr>`;
    } else {
      const frag = document.createDocumentFragment();
      for (const a of actions){
        // derive department from indicator if action row lacks it
        const ind = indById.get(String(a.indicator_id));
        const deptId = a.department_id ?? ind?.department_id ?? '';
        const depLabel  = deptName[String(deptId)] || '';
        const unitLabel = a.unit_id ? (unitName[String(a.unit_id)] || '') : '';

        const periodLabel = prettyPeriod(a.year, a.month);
        const { cls, label } = statusBadge(a);

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <div class="fw-semibold">${ind?.indicator_name || a.indicator_id}</div>
            <div class="small text-muted">${depLabel}${unitLabel?` / ${unitLabel}`:''}</div>
          </td>
          <td style="white-space:nowrap">${periodLabel}</td>
          <td>${a.issue_text || ''}</td>
          <td>${a.action_text || ''}</td>
          <td>${a.action_owner || ''}</td>
          <td style="white-space:nowrap">${a.action_due || ''}</td>
          <td class="text-end">
            <span class="badge ${cls}">${label}</span>
            ${SUPER ? `<button class="btn btn-sm btn-outline-danger ms-2" data-del="${a.action_id}">លុប</button>` : ''}
          </td>
        `;
        frag.appendChild(tr);
      }
      tbody.innerHTML = ''; tbody.appendChild(frag);

      // delete (SUPER only)
      if (SUPER){
        tbody.addEventListener('click', async (e)=>{
          const btn = e.target.closest('button[data-del]'); if(!btn) return;
          const id = btn.getAttribute('data-del');
          if (!id) return;
          if (!confirm('លុបធាតុនេះមែនទេ?')) return;
          try{
            await gasDelete('actions', ID_FIELDS.actions, id);
            btn.closest('tr')?.remove();
          }catch(err){
            alert('បរាជ័យលុប: ' + (err?.message || err));
          }
        });
      }
    }

    // Summary in Khmer
    const toLower = v=>String(v||'').toLowerCase();
    const total   = actions.length;
    const planned = actions.filter(a=>toLower(a.action_status)==='planned').length;
    const ongoing = actions.filter(a=>toLower(a.action_status)==='ongoing').length;
    const done    = actions.filter(a=>toLower(a.action_status)==='done').length;
    const blocked = actions.filter(a=>toLower(a.action_status)==='blocked').length;

    if (sumEl){
      sumEl.textContent = `សរុប ${total} • បានគ្រោង ${planned} • កំពុងដំណើរការ ${ongoing} • បានបញ្ចប់ ${done} • មានឧបសគ្គ ${blocked}`;
    }
  }catch(err){
    console.error(err);
    if (tbody){
      tbody.innerHTML = `<tr><td colspan="8" class="text-danger text-center py-4">បរាជ័យក្នុងការទាញទិន្នន័យ</td></tr>`;
    }
  }
}
