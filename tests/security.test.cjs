const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { parseFragment } = require('parse5');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const utils = {};
vm.runInNewContext(read('assets/js/utils.js').replace('export function', 'function') + '\nthis.escapeHtml = escapeHtml;', utils);
const { escapeHtml } = utils;
const payloads = ['<img src=x onerror=alert(1)>', '"><svg onload=alert(1)>', "' autofocus onfocus='alert(1)", '&quot;<script>alert(1)</script>', 'សុខាភិបាល & "A" < B', 0, null];

// Run the actual row templates, including their nested editable/read-only branches.
function row(file, context, marker = 'tr.innerHTML = `') {
  const source = read(file);
  const start = source.indexOf(marker);
  assert.ok(start >= 0, file);
  const templateStart = source.indexOf('`', start);
  const end = source.indexOf('`;', templateStart + 1);
  assert.ok(end > templateStart, file);
  return vm.runInNewContext(source.slice(templateStart, end + 1), { escapeHtml, ...context });
}
function descendants(node) {
  return [node, ...(node.childNodes || []).flatMap(descendants)];
}
function attribute(node, name) {
  return node.attrs?.find(a=>a.name===name)?.value;
}
function safeMarkup(markup, value) {
  const nodes = descendants(parseFragment(markup));
  assert.ok(!nodes.some(n=>['script','img','svg'].includes(n.tagName)), markup);
  assert.ok(!nodes.some(n=>n.attrs?.some(a=>/^on/i.test(a.name))), markup);
  assert.ok(!/<(?:img|svg|script)\b/i.test(markup), markup);
  assert.ok(markup.includes(escapeHtml(value)), markup);
}

test('HTML escaping handles both quote styles, entities, Khmer and null without losing data', () => {
  assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(escapeHtml('សុខាភិបាល'), 'សុខាភិបាល');
  assert.equal(escapeHtml(0), '0');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml('&lt;img&gt;'), '&amp;lt;img&amp;gt;');
});

test('units and departments render stored fields as text with actions retained', () => {
  for (const value of payloads) {
    safeMarkup(row('assets/js/pages/units.page.js', { u: { unit_id:value, unit_name:value, unit_type:value }, ID_FIELD:'unit_id', deptNameById:()=>value, SUPER:true }, 'tr.innerHTML = `\n          <td>'), value);
    const html = row('assets/js/pages/departments.page.js', { r:{department_id:value, department_name:value}, SUPER:true });
    safeMarkup(html, value);
    assert.match(html, /data-act="edit"/);
  }
});

test('indicator names, IDs and quoted data-key attributes cannot create markup', () => {
  for (const value of payloads) {
    const r = Object.fromEntries(['indicator_id','indicator_name','indicator_type','department_name','unit_name','owner'].map(k=>[k,value]));
    const html = row('assets/js/pages/indicators.page.js', { r, key:value, SUPER:true, isChecked:true, canEdit:true });
    safeMarkup(html, value);
    assert.ok(html.includes(`data-key="${escapeHtml(value)}"`));
    const keys = descendants(parseFragment(html)).filter(n=>attribute(n,'data-key')!==undefined);
    assert.ok(keys.length > 0);
    keys.forEach(n=>assert.equal(attribute(n,'data-key'),String(value ?? '')));
    assert.match(html, /type="checkbox"/);
  }
});

test('data-entry protects input attributes and read-only values without encoding lookup keys', () => {
  for (const value of payloads) for (const can_edit of [true,false]) {
    const html = row('assets/js/pages/data-entry.page.js', {
      r:{indicator_id:value,indicator_name:value,can_edit}, rowNum:'១.១.១', missingDB:false,
      pid:'2026-10', prettyPid:()=>value, key:value, showValue:value, showTarget:value,
      dbValue:value, dbTarget:value, isEmptyVal:v=>v==null
    });
    safeMarkup(html, value);
    assert.ok(html.includes(`data-key="${escapeHtml(value)}"`));
    const keys = descendants(parseFragment(html)).filter(n=>attribute(n,'data-key')!==undefined);
    assert.ok(keys.length > 0);
    keys.forEach(n=>assert.equal(attribute(n,'data-key'),String(value ?? '')));
    if (can_edit) assert.ok(html.includes(`value="${escapeHtml(value)}"`));
  }
  assert.ok(read('assets/js/pages/data-entry.page.js').includes('const key = `${r.indicator_id}|${r.unit_id}`;'));
});

test('unknown route treats malicious hash as text', () => {
  const source = read('assets/js/hydrate.js');
  const fn = source.slice(source.indexOf('function renderNotFound'), source.indexOf('function setTitleFromModule'));
  for (const value of payloads) {
    const root = {};
    vm.runInNewContext(fn + '\nrenderNotFound(root, value);', { root, value, escapeHtml });
    safeMarkup(root.innerHTML, value);
  }
});

function callableHarness(cryptoImpl = require('node:crypto')) {
  const calls = [];
  class HttpsError extends Error { constructor(code, message) { super(message); this.code=code; } }
  const auth = {
    createUser:async data=>{ calls.push(data); return {uid:'created-uid'}; },
    updateUser:async (uid,data)=>{ calls.push({uid,...data}); },
    getUserByEmail:async ()=>({uid:'email-uid'})
  };
  const sandbox = { exports:{}, console, Math:Object.create(Math), require(name) {
    if (name==='firebase-functions') return { https:{onCall:fn=>fn,HttpsError} };
    if (name==='firebase-admin') return { initializeApp(){},auth:()=>auth };
    if (name==='node:crypto') return cryptoImpl;
    throw new Error(name);
  } };
  sandbox.Math.random = ()=>{ throw new Error('Math.random must not generate passwords'); };
  vm.runInNewContext(read('functions/index.js'),sandbox);
  return { handlers:sandbox.exports,calls };
}
const superContext = {auth:{token:{role:'super'}}};

test('create-user uses all 24 CSPRNG bytes and preserves Firebase request and response', async () => {
  let bytesRequested;
  const {handlers,calls} = callableHarness({ randomBytes(size) { bytesRequested=size; return Buffer.alloc(size,0xa5); } });
  const result = await handlers.adminCreateUser({email:'staff@example.com',displayName:'សុខា'},superContext);
  assert.equal(bytesRequested,24);
  assert.equal(calls[0].password,Buffer.alloc(24,0xa5).toString('base64url'));
  assert.equal(calls[0].email,'staff@example.com');
  assert.equal(calls[0].displayName,'សុខា');
  assert.equal(JSON.stringify(result),JSON.stringify({ok:true,uid:'created-uid'}));
  assert.ok(!Object.hasOwn(result,'password'));
});

test('actual crypto password generation works while Math.random is forbidden', async () => {
  const {handlers,calls} = callableHarness();
  for(let i=0;i<32;i++) await handlers.adminCreateUser({email:'staff@example.com'},superContext);
  assert.equal(new Set(calls.map(x=>x.password)).size,32);
  calls.forEach(x=>assert.match(x.password,/^[A-Za-z0-9_-]{32}$/));
});

test('callable auth, role, required email and reset-password checks remain intact', async () => {
  const {handlers,calls} = callableHarness();
  for(const handler of Object.values(handlers)) {
    await assert.rejects(handler({},{}),{code:'unauthenticated'});
    await assert.rejects(handler({},{auth:{token:{role:'admin'}}}),{code:'permission-denied'});
  }
  await assert.rejects(handlers.adminCreateUser({},superContext),{code:'invalid-argument'});
  await assert.rejects(handlers.adminSetPassword({newPassword:'short'},superContext),{code:'invalid-argument'});
  assert.equal(calls.length,0);
  await handlers.adminSetPassword({uid:'staff-id',newPassword:'Valid12345'},superContext);
  assert.equal(calls[0].uid,'staff-id');
  assert.equal(calls[0].password,'Valid12345');
});


test('year dropdowns escape arbitrary stored years in both text and attributes', () => {
  for (const page of ['home','reports','issues','super-dashboard']) {
    const line = read(`assets/js/pages/${page}.page.js`).split('\n').find(l=>l.includes('<option') && l.includes('${escapeHtml(y)}'));
    assert.ok(line,page);
    const start=line.indexOf('`<option');
    const template=line.slice(start,line.indexOf('`',start+1)+1);
    for (const value of payloads) {
      const html = vm.runInNewContext(template,{escapeHtml,y:value});
      safeMarkup(html,value);
      const option=descendants(parseFragment(html)).find(n=>n.tagName==='option');
      if (attribute(option,'value')!==undefined) assert.equal(attribute(option,'value'),String(value ?? ''));
    }
  }
});

test('reports escape issue/action text separately while retaining line breaks and numeric values', () => {
  for (const value of payloads) {
    const html=row('assets/js/pages/reports.page.js',{
      r:{indicator_name:value,issues:[value,'សុខា'],actions:[value],value:12,target:20},
      tagChosen:'M10',pretty:()=>value,esc:escapeHtml
    },'tr.innerHTML = `\n            <td>');
    safeMarkup(html,value);
    assert.match(html,/<br>• សុខា/);
    assert.match(html,/>12<\/td>/);
  }
});

test('users preserve decoded action IDs and email while preventing attribute injection', () => {
  for (const value of payloads) {
    const html=row('assets/js/pages/users.page.js',{
      r:{user_id:value,full_name:value,email:value,phone:value,department:value,unit:value,status:'active'},
      hasUid:true,roleBadge:()=>'<b>SUPER</b>',statusBadge:()=>'<b>ACTIVE</b>',STATUS:{ACTIVE:'active'}
    });
    safeMarkup(html,value);
    const buttons=descendants(parseFragment(html)).filter(n=>n.tagName==='button');
    assert.equal(buttons.length,4);
    assert.equal(attribute(buttons[0],'data-id'),String(value ?? ''));
    assert.equal(attribute(buttons[1],'data-email'),String(value ?? ''));
  }
});
