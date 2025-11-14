// assets/js/app.api.firebase.js
import { db } from './firebase.client.js';
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

/* ============================================================================
   PRIMARY KEYS (per collection)
   - សម្រាប់ collections ទូទៅ យក PK ជា doc.id (no-dup)
   - សម្រាប់ reports → override ដោយ composite id: period__indicator__unit
============================================================================ */
export const ID_FIELDS = {
  indicators      : 'indicator_id',
  departments     : 'department_id',
  units           : 'unit_id',
  periods         : 'period_id',
  users           : 'user_id',
  import_mappings : 'indicator_id',  // mapping តាម indicator
  // (compat only; reports នឹង override ដោយ composite id)
  reports         : 'report_id',
};

const getIdField = (coll) => ID_FIELDS[coll] || 'id';

/* ============================================================================
   Utilities
============================================================================ */
const toStr = (x) => String(x ?? '').trim();
const isNonEmpty = (x) => toStr(x) !== '';
// ជៀសប៉ះទង្គិច delimiter "__" ដោយ encodeURIComponent
const esc = (s) => encodeURIComponent(toStr(s));

/** Export សម្រាប់ប្រើ debug / tooling ផ្សេងៗ */
export const composeReportId = (period_id, indicator_id, unit_id) =>
  `${esc(period_id)}__${esc(indicator_id)}__${esc(unit_id)}`;

/* ============================================================================
   LIST (query)
   - គាំទ្រ where equals សម្រាប់ fields ទូទៅ (ប្រើតែពេលអ្នកផ្ញើ params មក)
   - គាំទ្រ order_by/limit
============================================================================ */
export async function gasList(name, params = {}) {
  const col = collection(db, name);
  let qref = col;

  // Lightweight equals filters (apply only if provided)
  const EQ_KEYS_GENERIC = [
    'period_id', 'indicator_id', 'unit_id',
    'owner_uid', 'owner_id', 'department_id', 'user_id'
  ];
  for (const k of EQ_KEYS_GENERIC) {
    if (isNonEmpty(params[k])) qref = query(qref, where(k, '==', toStr(params[k])));
  }

  // Special-case (legacy) for indicators explicit filters
  if (name === 'indicators') {
    if (params.owner_uid)      qref = query(qref, where('owner_uid', '==', toStr(params.owner_uid)));
    else if (params.owner_id)  qref = query(qref, where('owner_id', '==', toStr(params.owner_id))); // backward compat
    if (params.department_id)  qref = query(qref, where('department_id', '==', toStr(params.department_id)));
    if (params.unit_id)        qref = query(qref, where('unit_id', '==', toStr(params.unit_id)));
  }

  if (params.order_by) qref = query(qref, orderBy(params.order_by, params.order_dir || 'asc'));
  if (params.limit)    qref = query(qref, limit(Number(params.limit)));

  const snap = await getDocs(qref);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ============================================================================
   Helpers (internal)
============================================================================ */
async function findDocsByPk(coll, pkField, pkValue) {
  const qref = query(collection(db, coll), where(pkField, '==', toStr(pkValue)));
  const snap = await getDocs(qref);
  return snap.docs; // array of QueryDocumentSnapshot
}

/* ============================================================================
   UPSERT
   - reports: composite id → deterministic upsert (no duplicate possible)
   - others : use PK as doc.id; plus cleanup duplicates where pkField == pkValue
============================================================================ */
export async function gasSave(coll, row = {}) {

  /* ---------- HARD-UNIQUE for `reports` (by composite id) ---------- */
  if (coll === 'reports') {
    const period_id    = toStr(row.period_id);
    const indicator_id = toStr(row.indicator_id);
    const unit_id      = toStr(row.unit_id);

    if (!period_id || !indicator_id || !unit_id) {
      throw new Error('reports: period_id, indicator_id, unit_id are required');
    }

    const docId = composeReportId(period_id, indicator_id, unit_id);
    const ref = doc(db, coll, docId);

    const toWrite = {
      ...row,
      id: docId,                            // convenience
      period_id, indicator_id, unit_id,     // normalize as string
      updated_at: serverTimestamp(),
      ...(row.__isCreate ? { created_at: serverTimestamp() } : {})
    };

    await setDoc(ref, toWrite, { merge: true }); // deterministic upsert
    const snap = await getDoc(ref);
    return { id: snap.id, ...snap.data() };
  }

  /* ---------- Default behavior for other collections ---------- */
  const pkField = getIdField(coll);
  let pkValue = row[pkField];

  if (!pkValue) {
    pkValue = (crypto?.randomUUID?.() || String(Date.now()));
    row[pkField] = pkValue;
  }
  const docId = toStr(pkValue);

  const ref = doc(db, coll, docId);
  const toWrite = {
    ...row,
    updated_at: serverTimestamp(),
    ...(row.__isCreate ? { created_at: serverTimestamp() } : {})
  };
  await setDoc(ref, toWrite, { merge: true });

  // delete duplicates stored under random doc ids (same logical PK)
  try {
    const dupDocs = await findDocsByPk(coll, pkField, pkValue);
    const toDelete = dupDocs.filter(d => d.id !== docId);
    for (const d of toDelete) {
      await deleteDoc(doc(db, coll, d.id));
    }
  } catch (_) { /* non-fatal cleanup */ }

  const snap = await getDoc(ref);
  return { id: snap.id, ...snap.data() };
}

/* ============================================================================
   DELETE
   - reports: accept composite id directly, or compute from (period,indicator,unit)
   - others : delete by doc.id; else delete all where pkField == value
============================================================================ */
export async function gasDelete(coll, idFieldName, idValue, extra = {}) {
  if (coll === 'reports') {
    let docId = toStr(idValue);

    // If caller supplies 3-key combo, compute composite id
    if (!docId && (extra.period_id || extra.indicator_id || extra.unit_id)) {
      const { period_id, indicator_id, unit_id } = extra;
      docId = composeReportId(period_id, indicator_id, unit_id);
    }

    if (!docId) throw new Error('reports delete: need composite id or period_id+indicator_id+unit_id');

    const r = doc(db, coll, docId);
    const s = await getDoc(r);
    if (s.exists()) await deleteDoc(r);
    return;
  }

  // Other collections
  const pkField = idFieldName || getIdField(coll);
  const pkValue = toStr(idValue);

  const directRef = doc(db, coll, pkValue);
  const directSnap = await getDoc(directRef);
  if (directSnap.exists()) {
    await deleteDoc(directRef);
    return;
  }

  const matches = await findDocsByPk(coll, pkField, pkValue);
  for (const d of matches) {
    await deleteDoc(doc(db, coll, d.id));
  }
}

/* ============================================================================
   GET (read one)
   - reports: accept composite id directly, or compute from (period,indicator,unit)
   - others : read by doc.id; else fallback to first match where pkField == value
============================================================================ */
export async function gasGet(coll, pkVal, extra = {}) {
  if (coll === 'reports') {
    // Accept composed id or (period,indicator,unit)
    let docId = toStr(pkVal);
    if (!docId && (extra.period_id || extra.indicator_id || extra.unit_id)) {
      const { period_id, indicator_id, unit_id } = extra;
      docId = composeReportId(period_id, indicator_id, unit_id);
    }
    if (!docId) throw new Error('reports get: need composite id or period_id+indicator_id+unit_id');

    const ref = doc(db, coll, docId);
    const snap = await getDoc(ref);
    return snap.exists() ? ({ id: snap.id, ...snap.data() }) : null;
  }

  const pkField = getIdField(coll);
  const docId = toStr(pkVal);

  // try direct doc id first
  if (docId) {
    const ref = doc(db, coll, docId);
    const snap = await getDoc(ref);
    if (snap.exists()) return { id: snap.id, ...snap.data() };
  }

  // fallback by query (legacy/random ids)
  if (docId) {
    const matches = await findDocsByPk(coll, pkField, docId);
    if (matches.length) {
      const d = matches[0];
      return { id: d.id, ...d.data() };
    }
  }
  return null;
}
