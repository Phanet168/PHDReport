// assets/js/app.api.firebase.js
import { db } from './firebase.client.js';
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

export const ID_FIELDS = {
  indicators: 'indicator_id',
  departments: 'department_id',
  units: 'unit_id',
  periods: 'period_id',
  users: 'user_id'
};

export async function gasList(name, params = {}) {
  const col = collection(db, name);
  let q = col;

  if (name === 'indicators') {
    if (params.owner_uid)      q = query(q, where('owner_uid', '==', String(params.owner_uid)));
    else if (params.owner_id)  q = query(q, where('owner_id', '==', String(params.owner_id))); // backward compat
    if (params.department_id)  q = query(q, where('department_id', '==', String(params.department_id)));
    if (params.unit_id)        q = query(q, where('unit_id', '==', String(params.unit_id)));
  }

  if (params.order_by) q = query(q, orderBy(params.order_by, params.order_dir || 'asc'));
  if (params.limit)    q = query(q, limit(Number(params.limit)));

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ✅ write-first (no pre-read) → avoids rule violation on create
export async function gasSave(coll, row = {}) {
  const idField = ID_FIELDS[coll] || 'id';
  let id = row[idField];
  if (!id) {
    id = (crypto?.randomUUID?.() || String(Date.now()));
    row[idField] = id;
  }

  const ref = doc(db, coll, String(id));
  const toWrite = {
    ...row,
    updated_at: serverTimestamp(),
    ...(row.__isCreate ? { created_at: serverTimestamp() } : {})
  };

  await setDoc(ref, toWrite, { merge: true });

  const snap = await getDoc(ref);
  return { id: snap.id, ...snap.data() };
}

export async function gasDelete(coll, idFieldName, idValue) {
  const ref = doc(db, coll, String(idValue));
  await deleteDoc(ref);
}
