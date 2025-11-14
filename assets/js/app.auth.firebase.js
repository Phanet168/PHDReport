// assets/js/app.api.firebase.js
import { db } from "./firebase.client.js";
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  query, where, runTransaction
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

export const ID_FIELDS = {
  users:'user_id', departments:'department_id', units:'unit_id',
  periods:'period_id', indicators:'indicator_id', reports:'report_id',
  issues:'issue_id', actions:'action_id',
  reports: 'report_id', 
};

const rowOfDoc = (snap)=> ({ ...(snap.data()||{}) });

function buildWheres(params = {}){
  const KEYS = [
  'department_id','unit_id','owner_id','year','month',
  'indicator_id','report_id','period_id','action_id','issue_id','user_id'
];

  const W = [];
  for (const k of KEYS){
    const v = params[k];
    if (v !== undefined && v !== null && v !== '') {
      W.push(where(k, '==', (typeof v==='string' && /^\d+$/.test(v)) ? Number(v) : v));
    }
  }
  return W;
}

async function getNextId(table){
  const ref = doc(db, 'meta', 'counters');
  const next = await runTransaction(db, async (tx)=>{
    const snap = await tx.get(ref);
    const cur  = snap.exists() ? (snap.data()[table] || 0) : 0;
    const val  = Number(cur) + 1;
    tx.set(ref, { [table]: val }, { merge:true });
    return val;
  });
  return next;
}

export async function gasList(table, params = {}){
  const col = collection(db, table);
  const wh  = buildWheres(params);
  const qy  = (wh.length ? query(col, ...wh) : col);
  const ss  = await getDocs(qy);
  let rows  = ss.docs.map(rowOfDoc);

  const qText = String(params.q || '').trim().toLowerCase();
  if (qText) rows = rows.filter(r => JSON.stringify(r).toLowerCase().includes(qText));

  for (const [k,v] of Object.entries(params)){
    if (k.startsWith('like_') && v){
      const f = k.slice(5);
      const needle = String(v).toLowerCase();
      rows = rows.filter(r => String(r[f] ?? '').toLowerCase().includes(needle));
    }
  }
  return rows;
}

export async function gasSave(table, row = {}){
  const idField = ID_FIELDS[table] || 'id';
  const col     = collection(db, table);
  const now     = new Date().toISOString();
  let id        = row[idField];
  
  if (!id){
    id = await getNextId(table);
    row[idField]   = id;
    row._createdAt = row._createdAt || now;
    row._updatedAt = now;
    await setDoc(doc(col, String(id)), row, { merge:false });
    return { row };
  }

  row._updatedAt = now;
  await setDoc(doc(col, String(id)), row, { merge:true });
  const saved = await getDoc(doc(col, String(id)));
  return { row: rowOfDoc(saved) };
}

export async function gasDelete(table, idField, idValue){
  const col = collection(db, table);
  await deleteDoc(doc(col, String(idValue)));
  return { ok:true, [idField || ID_FIELDS[table] || 'id']: idValue };
}
