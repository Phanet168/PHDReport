// assets/js/pages/issues.page.js
// Page module for "#/issues" — Khmer UI, grouped by Department → Unit,
// sorted by department_id → unit_id → indicator_name → due date.
// Features:
// - Role-based access control (SUPER sees all, users see only their unit/department)
// - Edit & Delete actions (SUPER only)
// - Resolution tracking when marking actions as "done"
// - Top-bar notification hook via window.setIssueAlert(stats)
// - PDF export via Google Apps Script

import { getAuth, isSuper } from '../app.auth.js';
import { gasList, gasDelete, ID_FIELDS } from '../app.api.firebase.js';
import { db } from '../firebase.client.js';
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';

/* ============================================================================
   CONSTANTS & CONFIG
============================================================================ */
const GAS_WEBAPP = 'https://script.google.com/macros/s/AKfycbwdPlP8f91XpvW7142HUnTRwHVVK4dMWNwMprUVzwIIRxMdIZBPERvxpU6LBoIJStolag/exec';

const KH_MONTHS = ['មករា','កុម្ភៈ','មិនា','មេសា','ឧសភា','មិថុនា','កក្កដា','សីហា','កញ្ញា','តុលា','វិច្ឆិកា','ធ្នូ'];

const PERIOD = {
  months: ['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12'],
  quarters: ['Q1','Q2','Q3','Q4'],
  halves: ['H1','H2']
};

const SORT_KEYS = [
  {idx: 0, key: 'indicator_name', type: 'text'},
  {idx: 1, key: 'period_sort', type: 'number'},
  {idx: 2, key: 'issue_text', type: 'text'},
  {idx: 3, key: 'action_text', type: 'text'},
  {idx: 4, key: 'action_owner', type: 'text'},
  {idx: 5, key: 'action_due', type: 'date'},
  {idx: 6, key: 'action_status', type: 'text'}
];

/* ============================================================================
   MAIN PAGE FUNCTION
============================================================================ */
export default async function issuesPage(root, ctx) {
  /* ====== Authentication & Role ====== */
  const SUPER = isSuper?.() || (String((getAuth?.()||{}).role||'').toLowerCase()==='super');
  const authData = getAuth?.() || {};
  const currentUserId = authData.uid || authData.user_id || null;
  const currentUserDept = authData.department_id || null;
  const currentUserUnit = authData.unit_id || null;

  /* ====== DOM (scoped to root) ====== */
  const $  = s => root.querySelector(s);
  const $$ = s => Array.from(root.querySelectorAll(s));

  const tbody   = $("#tblIssues tbody");
  const thead   = $("#tblIssues thead");
  const sumEl   = $("#issuesSummary");
  const segBtns = $$(".segbtn");
  const ySel    = $("#ySel");
  const tagWrap = $("#tagWrap");
  const tagSel  = $("#tagSel");
  const tableView = $("#tableView");
  const resolutionView = $("#resolutionView");
  const resolutionContent = $("#resolutionContent");
  const btnApply= $("#btnApply");
  const btnReset= $("#btnReset");
  const btnPdf  = $("#btnDownloadPdf");
  const scopeBadge = $("#scopeBadge");
  if (!tbody || !thead || !sumEl) return;

  document.documentElement.classList.toggle("is-super", !!SUPER);

  /* ====== Utility Functions ====== */
  const esc = s => String(s??'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  
  const fmtDate = s => {
    if (!s) return '';
    const d = new Date(s);
    if (Number.isNaN(+d)) return esc(s);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  };
  
  const pretty = (y, t) => {
    if (!y || !t) return '';
    if (/^M\d{2}$/.test(t)) return `${KH_MONTHS[+t.slice(1)-1]} ${y}`;
    if (/^Q[1-4]$/.test(t)) return `ត្រីមាស ${t.slice(1)} • ${y}`;
    if (/^H[12]$/.test(t)) return `ឆមាស ${t.slice(1)} • ${y}`;
    if (t === 'Y12') return `ឆ្នាំ ${y}`;
    return `${y} ${t}`;
  };
  
  const khStatusLabel = s => {
    const v = String(s||'').toLowerCase();
    if (v === 'planned') return 'បានគ្រោង';
    if (v === 'ongoing' || v === 'in-progress') return 'កំពុងដំណើរការ';
    if (v === 'done' || v === 'completed') return 'បានបញ្ចប់';
    if (v === 'blocked') return 'មានឧបសគ្គ';
    return 'កំពុងរៀបចំ';
  };
  
  const statusClass = s => {
    const v = String(s||'').toLowerCase();
    if (v === 'done' || v === 'completed') return 'status-done';
    if (v === 'ongoing' || v === 'in-progress') return 'status-progress';
    if (v === 'blocked') return 'status-blocked';
    if (v === 'planned') return 'status-pending';
    return 'status-pending';
  };
  
  const periodToSortable = (y, t) => {
    t = String(t||'').toUpperCase();
    if (/^M\d{2}$/.test(t)) return y * 10000 + (+t.slice(1));
    if (/^Q[1-4]$/.test(t)) return y * 10000 + (['Q1','Q2','Q3','Q4'].indexOf(t) + 1) * 100;
    if (/^H[12]$/.test(t)) return y * 10000 + (t === 'H1' ? 10 : 20) * 100;
    if (t === 'Y12') return y * 10000 + 9999;
    return y * 10000;
  };

  // Khmer-friendly code compare (for department/unit codes like 01, 1.1)
  const cmpCode = (a, b) => {
    const sa = String(a??''), sb = String(b??'');
    return sa.localeCompare(sb, 'km-KH', {numeric: true, sensitivity: 'base'});
  };

  // Safe base64url encoding for GAS form submission
  const toB64UTF8 = obj => {
    const s = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(s);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  /* ====== State Management ====== */
  let MODE = 'all';          // Current view mode (unused in current implementation)
  let sortBy = null;          // Currently sorted column key
  let sortDir = 1;            // Sort direction: 1 = ascending, -1 = descending
  let ALL = [];               // Filtered and enriched action records

  /* ====== Data Loading & Normalization ====== */
  
  // Load all required collections in parallel
  const [rawActions, rawInd, rawUnit, rawDept] = await Promise.all([
    gasList('actions', {}).catch(err => {
      console.error('[issues] Failed to load actions:', err);
      return [];
    }),
    gasList('indicators', {}).catch(err => {
      console.error('[issues] Failed to load indicators:', err);
      return [];
    }),
    gasList('units', {}).catch(err => {
      console.error('[issues] Failed to load units:', err);
      return [];
    }),
    gasList('departments', {}).catch(err => {
      console.error('[issues] Failed to load departments:', err);
      return [];
    }),
  ]);

  // Normalize action fields (handle legacy field names)
  const actions = rawActions.map(a => ({
    ...a,
    action_year:    a.action_year || a.year || '',
    action_month:   a.action_month || a.month || '',
    action_target:  a.action_target || a.target || '',
    action_result:  a.action_result || a.result || '',
    issue_year:     a.issue_year || a.year || '',
    issue_month:    a.issue_month || a.month || '',
    action_status:  a.action_status || a.status || 'planned',
  }));

  // Build lookup maps for fast access
  const indById = new Map(
    rawInd.map(i => [
      String(i.indicator_id),
      {
        ...i,
        indicator_name: i.indicator_name || i.name || '',
        target: i.target || 0,
      }
    ])
  );

  const unitById = new Map(
    rawUnit.map(u => [
      String(u.unit_id),
      {
        ...u,
        unit_name: u.unit_name || u.name || '',
        unit_code: u.unit_code || u.code || '',
        department_id: u.department_id || u.dept_id || '',
      }
    ])
  );

  const deptById = new Map(
    rawDept.map(d => [
      String(d.department_id),
      {
        ...d,
        department_name: d.department_name || d.name || '',
        department_code: d.department_code || d.code || '',
      }
    ])
  );

  // Enrich actions with related data (indicator → unit → department)
  ALL = actions.map(a => {
    const i = indById.get(String(a.indicator_id));
    const u = unitById.get(String(a.unit_id));
    const d = u ? deptById.get(String(u.department_id)) : null;
    return {
      ...a,
      indicator_name: i?.indicator_name || '',
      target: i?.target || 0,
      unit_id: u?.unit_id || a.unit_id || '',
      unit_name: u?.unit_name || '',
      unit_code: u?.unit_code || '',
      department_id: d?.department_id || u?.department_id || '',
      department_name: d?.department_name || '',
      department_code: d?.department_code || '',
    };
  });

  /* ====== Security Filter (Role-Based Access Control) ====== */
  /*
   * Non-super users only see actions where BOTH conditions are true:
   * 1. action.unit_id matches their unit/department
   * 2. indicator.unit_id also matches their unit/department
   * 
   * This double-check prevents users from seeing actions that reference
   * indicators belonging to other units (security vulnerability fix).
   */
  if (!SUPER) {
    ALL = ALL.filter(action => {
      const ind = indById.get(String(action.indicator_id));
      
      // Unit-level filtering
      if (currentUserUnit) {
        const actionMatch = String(action.unit_id) === String(currentUserUnit);
        const indicatorMatch = ind ? String(ind.unit_id) === String(currentUserUnit) : false;
        return actionMatch && indicatorMatch;
      }
      
      // Department-level filtering
      if (currentUserDept) {
        const actionUnit = unitById.get(String(action.unit_id));
        const actionDeptMatch = actionUnit 
          ? String(actionUnit.department_id) === String(currentUserDept) 
          : false;
        
        const indicatorUnit = ind ? unitById.get(String(ind.unit_id)) : null;
        const indicatorDeptMatch = indicatorUnit 
          ? String(indicatorUnit.department_id) === String(currentUserDept) 
          : false;
        
        return actionDeptMatch && indicatorDeptMatch;
      }
      
      return false;
    });
  }

  /* ====== Skeleton while loading ====== */
  if (tbody) {
    const skeleton = (n = 6) => {
      tbody.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><div class="skel" style="width:70%"></div><div class="skel mt-1" style="width:40%"></div></td>
          <td><div class="skel" style="width:80px"></div></td>
          <td><div class="skel"></div></td>
          <td><div class="skel"></div></td>
          <td><div class="skel" style="width:120px"></div></td>
          <td><div class="skel" style="width:84px"></div></td>
          <td><div class="skel" style="width:160px"></div></td>`;
        tbody.appendChild(tr);
      }
    };
    skeleton();
  }

  /* ====== Build Render Groups ====== */
  // Department and unit name lookups from existing maps
  const unitName = Object.fromEntries(
    Array.from(unitById.entries()).map(([id, u]) => [id, u.unit_name])
  );
  const deptName = Object.fromEntries(
    Array.from(deptById.entries()).map(([id, d]) => [id, d.department_name])
  );

  /* ====== Filter Helpers ====== */
  /* ====== Filter Helpers ====== */
  
  /**
   * Build year dropdown options from available data
   */
  function buildYearOptions(list) {
    const years = [...new Set(list.map(a => a.action_year || a.year).filter(Boolean))].sort((a, b) => b - a);
    const opts = ['<option value="">ទាំងអស់</option>'].concat(
      years.map(y => `<option value="${y}">${y}</option>`)
    );
    if (ySel) ySel.innerHTML = opts.join('');
  }
  
  /**
   * Fill period tag dropdown based on current mode
   */
  function fillTagOptions() {
    if (!tagSel) return;
    let opts = '';
    if (MODE === 'month') {
      opts = PERIOD.months.map(t => `<option value="${t}">${t}</option>`).join('');
    } else if (MODE === 'quarter') {
      opts = PERIOD.quarters.map(t => `<option value="${t}">${t}</option>`).join('');
    } else if (MODE === 'half') {
      opts = PERIOD.halves.map(t => `<option value="${t}">${t}</option>`).join('');
    }
    tagSel.innerHTML = `<option value="">ទាំងអស់</option>` + opts;
    if (tagWrap) {
      tagWrap.style.display = (MODE === 'month' || MODE === 'quarter' || MODE === 'half') ? '' : 'none';
    }
  }
  
  /**
   * Update table header with sort indicators
   */
  function setHeaderMark() {
    thead.querySelectorAll('th').forEach(th => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      th.querySelector('.sort-mark')?.remove();
    });
    
    if (sortBy == null) return;
    
    const conf = SORT_KEYS.find(c => c.key === sortBy);
    if (!conf) return;
    
    const th = thead.querySelectorAll('th')[conf.idx];
    const mark = document.createElement('span');
    mark.className = 'sort-mark';
    mark.textContent = sortDir === 1 ? ' ▲' : ' ▼';
    th.appendChild(mark);
    th.classList.add(sortDir === 1 ? 'sorted-asc' : 'sorted-desc');
  }

  /**
   * Check if action matches filter criteria
   */
  function matches(a, mode, year, tag) {
    const yOk = !year || String(a.action_year || a.year) === String(year);
    const t = String(a.action_month || a.month || a.tag || '').toUpperCase();

    if (mode === 'all') return yOk;
    if (!yOk) return false;

    if (mode === 'year') return t === 'Y12';
    if (mode === 'month') return /^M\d{2}$/.test(t) && (!tag || t === tag);
    if (mode === 'quarter') return /^Q[1-4]$/.test(t) && (!tag || t === tag);
    if (mode === 'half') return /^H[12]$/.test(t) && (!tag || t === tag);
    return true;
  }

  /* ====== Rendering Functions ====== */
  
  /**
   * Render resolution tracking view grouped by indicator
   */
  function renderResolutionView(rows) {
    const resView = document.getElementById('resolutionView');
    const resContent = document.getElementById('resolutionContent');
    if (!resView || !resContent) return;
    
    // Filter actions that have resolution info
    const withResolution = rows.filter(a => a.action_status === 'done' || a.action_status === 'completed');
    
    if (!withResolution.length) {
      resContent.innerHTML = `<div class="alert alert-info"><small>គ្មានដំណោះស្រាយក្នុងចំណោមរឿងកើតឡើង</small></div>`;
      return;
    }
    
    // Group by indicator
    const byIndicator = {};
    withResolution.forEach(a => {
      const indName = a.indicator_name || 'Unknown';
      if (!byIndicator[indName]) {
        byIndicator[indName] = [];
      }
      byIndicator[indName].push(a);
    });
    
    // Render cards
    let html = '';
    for (const [indName, actions] of Object.entries(byIndicator)) {
      const resolved = actions.filter(a => a.action_status === 'done' || a.action_status === 'completed').length;
      const pending = actions.length - resolved;
      const allResolved = pending === 0;
      
      html += `
        <div class="resolution-card ${allResolved ? 'resolved' : 'pending'}">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <h6 class="mb-0">${esc(indName)}</h6>
            <div>
              <span class="resolution-badge resolution-done">✓ ${resolved}/${actions.length}</span>
            </div>
          </div>
          <div class="small">
      `;
      
      actions.forEach(a => {
        const isDone = a.action_status === 'done' || a.action_status === 'completed';
        const statusIcon = isDone ? '✓' : '⏳';
        const resDate = a.resolution_date ? fmtDate(a.resolution_date) : 'N/A';
        
        html += `
          <div class="mb-2 p-2 bg-light rounded">
            <div class="fw-semibold">${statusIcon} ${esc(a.action_text || 'Action')}</div>
            <div class="text-muted small mt-1">
              <strong>Issue:</strong> ${esc(a.issue_text || '-')}<br>
              <strong>Owner:</strong> ${esc(a.action_owner || '-')}<br>
              <strong>Due:</strong> ${fmtDate(a.action_due)}<br>
        `;
        
        if (isDone && a.resolution_text) {
          html += `<strong>Resolution:</strong> ${esc(a.resolution_text)}<br>`;
        }
        if (isDone && a.resolution_date) {
          html += `<strong>Resolved:</strong> ${resDate}<br>`;
        }
        
        html += `</div></div>`;
      });
      
      html += `</div></div>`;
    }
    
    resContent.innerHTML = html;
  }
  
  /**
   * Render table rows grouped by Department → Unit → Indicator
   */
  function renderRowsGrouped(rows){
    if(!rows.length){
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">គ្មានទិន្នន័យ</td></tr>`;
      return;
    }

    // ស្រង់ department ids មាននៅក្នុង rows ហើយតម្រៀបតាម department_id (code-friendly)
    const deptIds = [...new Set(rows.map(r => String(r.department_id||'')).map(x=>x||'@NA'))]
      .sort((a,b)=>cmpCode(a,b));

    const frag = document.createDocumentFragment();
    let dIdx = 0;

    for (const depId of deptIds) {
      dIdx++;
      const dMeta = deptMeta.get(depId) || { name: (depId==='@NA'?'(គ្មានជំពូក)':'ការិយាល័យ '+depId), code: depId };
      const depRows = rows.filter(r => String(r.department_id||'@NA') === depId);

      // Header ការិយាល័យ
      const trDep = document.createElement('tr');
      trDep.className = 'table-active';
      trDep.innerHTML = `<td colspan="7" class="fw-semibold">${dIdx}. ${esc(dMeta.name)}</td>`;
      frag.appendChild(trDep);

      // Units (តម្រៀបតាម unit_id)
      const unitIds = [...new Set(depRows.map(r => String(r.unit_id||'')).map(x=>x||'@NA'))]
        .sort((a,b)=>cmpCode(a,b));
      let uIdx = 0;

      for (const uId of unitIds) {
        uIdx++;
        const uMeta = unitMeta.get(uId) || { name: (uId==='@NA'?'(គ្មានផ្នែក)':'ផ្នែក '+uId), code: uId };
        const unitRows = depRows.filter(r => String(r.unit_id||'@NA') === uId);

        // Header ផ្នែក
        const trUnit = document.createElement('tr');
        trUnit.innerHTML = `<td colspan="7" class="ps-3"><span class="fw-semibold">${dIdx}.${uIdx} ${esc(uMeta.name)}</span></td>`;
        frag.appendChild(trUnit);

        // តម្រៀបក្នុងផ្នែកតាមឈ្មោះសូចនាករ (បង្ហាញតែឈ្មោះ), បន្ទាប់មកតាមកាលកំណត់
        const sorted = unitRows.slice().sort((a,b)=>{
          const byName = String(a.indicator_name||'').localeCompare(String(b.indicator_name||''), 'km-KH', {sensitivity:'base'});
          if (byName !== 0) return byName;
          const da = a.action_due?+new Date(a.action_due):0;
          const db = b.action_due?+new Date(b.action_due):0;
          return da - db;
        });

        for (const a of sorted){
          const ind=indById.get(String(a.indicator_id));
          const depLbl= dMeta.name || '';
          const unitLbl= uMeta.name || '';
          const actionId = a.action_id ?? a.actionId ?? a.id ?? '';

          const tr=document.createElement('tr');
          tr.innerHTML = `
            <td>
              <div class="fw-semibold">${esc(ind?.indicator_name || a.indicator_name || '(គ្មានឈ្មោះសូចនាករ)')}</div>
            </td>
            <td>${esc(pretty(a.year, a.month || a.tag))}</td>
            <td>${esc(a.issue_text || '')}</td>
            <td>${esc(a.action_text || '')}</td>
            <td>${esc(Array.isArray(a.action_owner)?a.action_owner.join(', '):(a.action_owner||''))}</td>
            <td>${fmtDate(a.action_due)}</td>
            <td class="text-end">
              <span class="badge-status ${statusClass(a.action_status)}">${esc(khStatusLabel(a.action_status))}</span>
              ${ (SUPER && actionId) ? `
                <button class="btn btn-sm btn-outline-primary ms-2 btn-edit" data-edit="${esc(actionId)}">កែប្រែ</button>
                <button class="btn btn-sm btn-outline-danger ms-2 btn-del" data-del="${esc(actionId)}">លុប</button>
              ` : '' }
            </td>`;
          frag.appendChild(tr);
        }
      }
    }
    tbody.replaceChildren(frag);
  }

  /* ====== Summary & Statistics ====== */
  
  /**
   * Update summary bar with action counts and scope indicator
   * @param {Array} rows - Filtered action records to summarize
   */
  function updateSummary(rows) {
    const low = v => String(v || '').toLowerCase();
    const planned = rows.filter(a => low(a.action_status) === 'planned').length;
    const ongoing = rows.filter(a => low(a.action_status) === 'ongoing' || low(a.action_status) === 'in-progress').length;
    const done = rows.filter(a => low(a.action_status) === 'done' || low(a.action_status) === 'completed').length;
    const blocked = rows.filter(a => low(a.action_status) === 'blocked').length;
    
    // Add scope indicator for regular users
    let scopeText = '';
    if (!SUPER) {
      if (currentUserUnit) {
        const unitInfo = unitById.get(String(currentUserUnit));
        scopeText = ` (${unitInfo?.unit_name || 'ផ្នែករបស់អ្នក'})`;
      } else if (currentUserDept) {
        const deptInfo = deptById.get(String(currentUserDept));
        scopeText = ` (${deptInfo?.department_name || 'ការិយាល័យរបស់អ្នក'})`;
      } else {
        scopeText = ' (របស់អ្នក)';
      }
    }
    
    if (sumEl) {
      sumEl.textContent = `សរុប ${rows.length}${scopeText} • បានគ្រោង ${planned} • កំពុងដំណើរការ ${ongoing} • បានបញ្ចប់ ${done} • ឧបសគ្គ ${blocked}`;
    }
  }
  
  /**
   * Calculate statistics for top-bar notification integration
   * @param {Array} rows - Action records to calculate stats for
   * @returns {Object} Stats object with total, planned, ongoing, done, blocked, isSuper, scope
   */
  function calcStats(rows) {
    const low = v => String(v || '').toLowerCase();
    return {
      total: rows.length,
      planned: rows.filter(a => low(a.action_status) === 'planned').length,
      ongoing: rows.filter(a => ['ongoing', 'in-progress'].includes(low(a.action_status))).length,
      done: rows.filter(a => ['done', 'completed'].includes(low(a.action_status))).length,
      blocked: rows.filter(a => low(a.action_status) === 'blocked').length,
      isSuper: SUPER,
      scope: SUPER ? 'all' : (currentUserUnit ? 'unit' : (currentUserDept ? 'department' : 'personal'))
    };
  }

  /* ====== Initial Render & UI Setup ====== */
  
  // Update scope badge to show current user's access level
  if (scopeBadge) {
    if (SUPER) {
      scopeBadge.textContent = '🌐 មើលទាំងអស់';
      scopeBadge.className = 'badge bg-primary text-white ms-2';
      scopeBadge.style.fontSize = '0.7rem';
      scopeBadge.style.fontWeight = '400';
    } else {
      let scopeLabel = '👤 របស់អ្នក';
      if (currentUserUnit) {
        const unitInfo = unitById.get(String(currentUserUnit));
        scopeLabel = `📂 ${unitInfo?.unit_name || 'ផ្នែករបស់អ្នក'}`;
      } else if (currentUserDept) {
        const deptInfo = deptById.get(String(currentUserDept));
        scopeLabel = `🏢 ${deptInfo?.department_name || 'ការិយាល័យរបស់អ្នក'}`;
      }
      scopeBadge.textContent = scopeLabel;
      scopeBadge.className = 'badge bg-light text-dark ms-2';
      scopeBadge.style.fontSize = '0.7rem';
      scopeBadge.style.fontWeight = '400';
    }
  }
  
  // Initial render
  buildYearOptions(ALL);
  renderRowsGrouped(ALL);
  updateSummary(ALL);
  if (window.setIssueAlert) window.setIssueAlert(calcStats(ALL));
  setHeaderMark();
  fillTagOptions();

  /* ====== Event Handlers ====== */
  
  /**
   * Handle period type segment button clicks
   */
  const onSegClick = (e) => {
    const b = e.currentTarget;
    segBtns.forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    MODE = b.dataset.type;
    fillTagOptions();
    
    // Toggle view visibility
    if (MODE === 'resolution') {
      tableView.style.display = 'none';
      resolutionView.style.display = 'block';
      renderResolutionView(getFilteredRows());
    } else {
      tableView.style.display = 'block';
      resolutionView.style.display = 'none';
    }
  };
  segBtns.forEach(b => b.addEventListener('click', onSegClick));

  /**
   * Get currently filtered data based on form inputs
   */
  const getFilteredRows = () => {
    const year = String(ySel?.value || '');
    const tag = tagSel ? String(tagSel.value || '').toUpperCase() : '';
    return (MODE === 'all') ? ALL : ALL.filter(a => matches(a, MODE, year, tag));
  };

  const currentBase = () => {
    const year = String(ySel?.value || '');
    const tag = tagSel ? String(tagSel.value || '').toUpperCase() : '';
    return (MODE === 'all') ? ALL : ALL.filter(a => matches(a, MODE, year, tag));
  };

  /**
   * Apply filter and refresh table
   */
  const onApply = () => {
    const rows = currentBase();
    if (MODE === 'resolution') {
      renderResolutionView(rows);
    } else {
      renderRowsGrouped(rows);
      updateSummary(rows);
      if (window.setIssueAlert) window.setIssueAlert(calcStats(rows));
      setHeaderMark();
    }
  };
  btnApply?.addEventListener('click', onApply);

  /**
   * Reset all filters to default state
   */
  const onReset = () => {
    MODE = 'all';
    segBtns.forEach(x => x.classList.toggle('active', x.dataset.type === 'all'));
    fillTagOptions();
    if (ySel) ySel.value = '';
    if (tagSel) tagSel.value = '';
    tableView.style.display = 'block';
    resolutionView.style.display = 'none';
    renderRowsGrouped(ALL);
    updateSummary(ALL);
    if (window.setIssueAlert) window.setIssueAlert(calcStats(ALL)); // ▶️ notify after reset
    sortBy=null; sortDir=1; setHeaderMark();
  };
  btnReset?.addEventListener('click', onReset);

  // Header click: visual only
  const onHeadClick = (e)=>{
    const th=e.target.closest('th'); if(!th) return;
    const idx=[...thead.querySelectorAll('th')].indexOf(th);
    const conf=SORT_KEYS.find(c=>c.idx===idx); if(!conf) return;
    if(sortBy===conf.key){ sortDir*=-1; } else { sortBy=conf.key; sortDir=1; }
    setHeaderMark();
  };
  thead.addEventListener('click', onHeadClick);

  /* ====== CRUD Operations (Super User Only) ====== */
  
  /**
   * Handle delete action button clicks
   * Only available for super users
   */
  const onTbodyClick = async (e) => {
    const btn = e.target.closest('button[data-del]');
    if (!btn) return;
    
    const id = btn.getAttribute('data-del');
    if (!id) return alert('មិនមាន action_id ដើម្បីលុប');
    if (!confirm('លុបធាតុនេះមែនទេ?')) return;
    
    try {
      const idField = (window.ID_FIELDS && window.ID_FIELDS.actions) || 'action_id';
      await gasDelete('actions', idField, id);
      
      // Update local data
      ALL = ALL.filter(r => String(r.action_id ?? r.actionId ?? r.id) !== String(id));
      const rows = currentBase();
      
      // Refresh UI
      renderRowsGrouped(rows);
      updateSummary(rows);
      if (window.setIssueAlert) window.setIssueAlert(calcStats(rows));
    } catch (err) {
      console.error('[delete-action]', err);
      alert('បរាជ័យលុប: ' + (err?.message || err));
    }
  };
  if (SUPER) tbody.addEventListener('click', onTbodyClick, { passive: true });

  /* ====== Edit Modal (Super User Only) ====== */
  let currentEditAction = null;

  /**
   * Show/hide resolution section based on action status
   */
  function updateResolutionUI() {
    const statusSelect = document.getElementById('editActionStatus');
    const resolutionSection = document.getElementById('resolutionSection');
    const resolutionDate = document.getElementById('editResolutionDate');
    
    if (!statusSelect || !resolutionSection) return;
    
    const isDone = statusSelect.value === 'done' || statusSelect.value === 'completed';
    resolutionSection.style.display = isDone ? '' : 'none';
    
    // Auto-fill resolution date with today if empty
    if (isDone && (!resolutionDate.value || resolutionDate.value === '')) {
      resolutionDate.value = new Date().toISOString().split('T')[0];
    }
  }

  /**
   * Handle edit button clicks - open modal with action data
   */
  const onEditClick = async (e) => {
    const btn = e.target.closest('button[data-edit]');
    if (!btn) return;
    
    const id = btn.getAttribute('data-edit');
    if (!id) return alert('មិនមាន action_id ដើម្បីកែប្រែ');

    // Find the action in ALL array
    const action = ALL.find(a => String(a.action_id ?? a.actionId ?? a.id) === String(id));
    if (!action) return alert('រកមិនឃើញសកម្មភាព');

    currentEditAction = action;

    // Get modal and form elements
    const editModal = document.getElementById('editActionModal');
    const form = document.getElementById('editActionForm');
    if (!editModal || !form) return alert('មិនអាចបង្កើតទម្រង់កែប្រែបានទេ');

    // Populate form fields (read-only fields)
    document.getElementById('editIndicator').value = action.indicator_name || '';
    document.getElementById('editYear').value = action.year || '';
    document.getElementById('editMonth').value = pretty(action.year, action.month || action.tag) || '';
    
    // Editable fields
    document.getElementById('editIssueText').value = action.issue_text || '';
    document.getElementById('editActionText').value = action.action_text || '';
    document.getElementById('editActionOwner').value = Array.isArray(action.action_owner) 
      ? action.action_owner.join(', ') 
      : (action.action_owner || '');
    document.getElementById('editActionDue').value = action.action_due 
      ? action.action_due.split('T')[0] 
      : '';
    document.getElementById('editActionStatus').value = action.action_status || 'planned';
    
    // Resolution fields (shown when status = done)
    document.getElementById('editResolutionText').value = action.resolution_text || '';
    document.getElementById('editResolutionDate').value = action.resolution_date 
      ? action.resolution_date.split('T')[0] 
      : new Date().toISOString().split('T')[0];
    document.getElementById('editActionId').value = id;

    // Show/hide resolution section based on current status
    updateResolutionUI();

    // Show modal
    const modal = new (window.bootstrap?.Modal || Bootstrap.Modal)(editModal);
    modal.show();
  };

  if (SUPER) tbody.addEventListener('click', onEditClick, { passive: true });

  // Status change listener - toggle resolution section visibility
  const editStatusSelect = document.getElementById('editActionStatus');
  if (editStatusSelect) {
    editStatusSelect.addEventListener('change', updateResolutionUI);
  }

  /**
   * Save edited action data to Firestore
   */
  const btnSaveEdit = document.getElementById('btnSaveEdit');
  if (btnSaveEdit && SUPER) {
    btnSaveEdit.addEventListener('click', async () => {
      const actionId = document.getElementById('editActionId').value;
      if (!actionId) return alert('សកម្មភាពលាក់\u200bនៃលាក់');

      const issueText = document.getElementById('editIssueText').value.trim();
      const actionText = document.getElementById('editActionText').value.trim();
      const actionOwner = document.getElementById('editActionOwner').value.trim();
      const actionDue = document.getElementById('editActionDue').value.trim();
      const actionStatus = document.getElementById('editActionStatus').value.trim();
      const resolutionText = document.getElementById('editResolutionText').value.trim();
      const resolutionDate = document.getElementById('editResolutionDate').value.trim();

      try {
        btnSaveEdit.disabled = true;
        const label = btnSaveEdit.textContent;
        btnSaveEdit.textContent = 'កំពុងរក្សាទុក…';

        // Prepare update payload
        const updateData = {
          issue_text: issueText || null,
          action_text: actionText || null,
          action_owner: actionOwner ? actionOwner.split(',').map(s => s.trim()).filter(s => s) : [],
          action_due: actionDue || null,
          action_status: actionStatus || 'planned',
          updated_at: serverTimestamp()
        };

        // Add resolution fields if marking as done
        const isDone = actionStatus === 'done' || actionStatus === 'completed';
        if (isDone) {
          updateData.resolution_text = resolutionText || null;
          updateData.resolution_date = resolutionDate || null;
          updateData.resolved_at = serverTimestamp();
        }

        // Update in ALL array
        const idx = ALL.findIndex(a => String(a.action_id ?? a.actionId ?? a.id) === String(actionId));
        if (idx >= 0) {
          ALL[idx] = { ...ALL[idx], ...updateData };
        }

        // Update in Firestore
        const docRef = doc(db, 'actions', actionId);
        await setDoc(docRef, updateData, { merge: true });

        // Reload and re-render
        const rows = currentBase();
        renderRowsGrouped(rows);
        updateSummary(rows);
        if (window.setIssueAlert) window.setIssueAlert(calcStats(rows));

        // Close modal
        const editModal = document.getElementById('editActionModal');
        if (editModal) {
          const modal = (window.bootstrap?.Modal || Bootstrap.Modal).getInstance(editModal);
          if (modal) modal.hide();
        }

        btnSaveEdit.textContent = label;
        btnSaveEdit.disabled = false;
      } catch (err) {
        console.error('[edit-action]', err);
        alert('បរាជ័យកែប្រែ: ' + (err?.message || err));
        btnSaveEdit.textContent = btnSaveEdit.getAttribute('data-original') || 'រក្សាទុក';
        btnSaveEdit.disabled = false;
      }
    });
  }

  /* ======================== Google Docs PDF (Form POST → GAS) ======================== */
  function ensureHiddenForm(){
    let form = document.getElementById('pdfForm');
    if (!form){
      form = document.createElement('form');
      form.id = 'pdfForm';
      form.action = `${GAS_WEBAPP}?route=issuesPdf&dl=1`;
      form.method = 'POST';
      form.target = '_blank';
      form.enctype = 'application/x-www-form-urlencoded';
      form.acceptCharset = 'utf-8';
      form.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'payload';
      input.id   = 'payloadB64';
      form.appendChild(input);
      document.body.appendChild(form);
    }
    return form;
  }
  function gatherMetaRows(){
    const year = String(ySel?.value || new Date().getFullYear());
    const activeBtn = root.querySelector('.segbtn.active');
    const CUR_MODE = activeBtn ? activeBtn.dataset.type : MODE;
    const tag  = tagSel ? String(tagSel.value || '').toUpperCase() : '';

    const base = (CUR_MODE==='all') ? (ALL||[]) : (ALL||[]).filter(a=>matches(a, CUR_MODE, year, tag));

    const rows = base.slice()
      .sort((a,b)=>{
        // same order as table: dept -> unit -> name -> due
        const c1 = cmpCode(a.department_id, b.department_id); if (c1) return c1;
        const c2 = cmpCode(a.unit_id, b.unit_id); if (c2) return c2;
        const c3 = String(a.indicator_name||'').localeCompare(String(b.indicator_name||''), 'km-KH', {sensitivity:'base'}); if (c3) return c3;
        const da=a.action_due?+new Date(a.action_due):0, db=b.action_due?+new Date(b.action_due):0;
        return da-db;
      })
      .map(a=>({
        indicator_id   : a.indicator_id,
        indicator_name : a.indicator_name,
        department_name: a.department_name,
        unit_name      : a.unit_name,
        year           : a.year,
        month          : a.month || a.tag,
        issue_text     : a.issue_text,
        action_text    : a.action_text,
        action_owner   : Array.isArray(a.action_owner)? a.action_owner.join(', ') : (a.action_owner||''),
        action_due     : a.action_due || '',
        action_status  : a.action_status || ''
      }));

    const meta = {
      year,
      tag : (CUR_MODE==='all') ? '' : (tag || ('M'+String(new Date().getMonth()+1).padStart(2,'0'))),
      summaryText: (sumEl?.textContent || '').trim(),
      org1:'មន្ទីរសុខាភិបាលខេត្ត',
      org2:'ផ្នែកផែនការ និងត្រួតពិនិត្យ',
      title1:'របាយការណ៍បញ្ហាប្រឈម',
      title2:'និង សកម្មភាព ដោះស្រាយ'
    };
    return { meta, rows };
  }
  function triggerDocsPdf(){
    const { meta, rows } = gatherMetaRows();
    if (!Array.isArray(rows) || rows.length === 0) {
      alert('មិនមាន rows ដើម្បីបង្កើត PDF ទេ');
      return;
    }
    const form  = ensureHiddenForm();
    const input = document.getElementById('payloadB64');
    if (!form || !input) { alert('មិនអាចបង្កើតសំណើរ PDF បានទេ'); return; }
    try { input.value = toB64UTF8({ meta, rows }); }
    catch (err) { console.error('Encode payload fail:', err); alert('បរាជ័យ encode ទិន្នន័យ'); return; }
    form.submit();
  }
  const onPdf = ()=>{
    if (!btnPdf) return;
    const label = btnPdf.textContent;
    btnPdf.disabled = true; btnPdf.textContent = 'កំពុងបង្កើត…';
    try { triggerDocsPdf(); }
    finally { setTimeout(()=>{ btnPdf.disabled=false; btnPdf.textContent=label; }, 800); }
  };
  btnPdf?.addEventListener('click', onPdf, { passive:true });

  /* ====== Cleanup ====== */
  return () => {
    segBtns.forEach(b=>b.removeEventListener('click', onSegClick));
    btnApply?.removeEventListener('click', onApply);
    btnReset?.removeEventListener('click', onReset);
    thead.removeEventListener('click', onHeadClick);
    if (SUPER) {
      tbody.removeEventListener('click', onTbodyClick, { passive:true });
      tbody.removeEventListener('click', onEditClick, { passive:true });
    }
    btnSaveEdit?.removeEventListener('click', null);
    btnPdf?.removeEventListener('click', onPdf);
  };
}

export function getTitle() {
  return 'បញ្ហាប្រឈម & សកម្មភាព | PHD Report';
}
