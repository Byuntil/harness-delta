import { appendFileSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from 'vitest';
import { Store } from '../src/store.js';
import { Lifecycle } from '../src/lifecycle.js';
import { Collector } from '../src/collection.js';
import { Deletion } from '../src/deletion.js';
import { collectionFixture, jsonLines, products } from './helpers/collection-fixture.js';
const at=(second:number)=>`2026-01-01T00:00:${String(second).padStart(2,'0')}.000Z`;
function fixture() {
 const root=mkdtempSync(join(tmpdir(),'collector-'));const source=join(root,'session.jsonl');
 const store=new Store(':memory:');let now=at(0);const clock=()=>now;
 const life=new Lifecycle(store,clock);life.registerProject('p1',root);
 life.createTask('p1','t1',{type:'feature',expected_size:'small',assignee:'u1',product:'codex',model:'synthetic',criterion_ids:['c1']});
 life.linkSession('t1','s1',source,'codex','0.156.1');
 const append=(...rows:unknown[])=>appendFileSync(source,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
 const turn=(second:number,input:number)=>append({timestamp:at(second),type:'event_msg',payload:{type:'task_started',turn_id:`turn${second}`}},{type:'turn_context',payload:{model:'synthetic'}},{timestamp:at(second+1),type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:input,cached_input_tokens:0,output_tokens:0,reasoning_output_tokens:0}}}},{timestamp:at(second+1),type:'event_msg',payload:{type:'task_complete',turn_id:`turn${second}`}});
 const header={type:'session_meta',payload:{id:'s1',cwd:root,source:'exec',cli_version:'0.156.1'}};
 writeFileSync(source,JSON.stringify(header)+'\n');
 return {root,source,store,life,clock,turn,set:(s:number)=>{now=at(s);},cleanup:()=>{store.close();rmSync(root,{recursive:true,force:true});}};
}
test('inactive and unlinked scopes cause no source reads',()=>{
 const f=fixture();let reads=0;const collector=new Collector(f.store,f.clock,()=>{reads++;throw new Error('PRIVATE');});
 try {collector.tick('t1');expect(reads).toBe(0);f.life.start('t1');f.store.execute('DELETE FROM sessions',[]);collector.tick('t1');expect(reads).toBe(0);}finally{f.cleanup();}
});
test('startup, pause and restart exclude old/in-flight turns; continuous new turns count once',()=>{
 const f=fixture();const collector=new Collector(f.store,f.clock);
 try {f.life.start('t1');f.turn(0,100);f.set(3);collector.tick('t1');f.turn(4,200);f.set(6);collector.tick('t1');collector.tick('t1');expect(f.store.eventCount()).toBe(1);
 f.life.pause('t1');f.turn(7,300);f.set(9);f.life.resume('t1');collector.tick('t1');expect(f.store.eventCount()).toBe(1);
 f.turn(10,400);f.set(12);collector.tick('t1');expect(f.store.eventCount()).toBe(2);
 const restarted=new Collector(f.store,f.clock);f.turn(13,500);f.set(15);restarted.tick('t1');expect(f.store.eventCount()).toBe(2);
 const rows=f.store.all<{payload:string}>('SELECT payload FROM events');expect(rows.map(r=>(JSON.parse(r.payload) as {input_total:{value:number}}).input_total.value)).toEqual([100,100]);
 }finally{f.cleanup();}
});
test('event/checkpoint atomicity, error sanitization and deletion prevent resurrection',()=>{
 const f=fixture();const collector=new Collector(f.store,f.clock);
 try {f.life.start('t1');collector.tick('t1');f.turn(2,100);f.set(4);
 const before=f.store.get<{checkpoint:string}>('SELECT checkpoint FROM cursors')?.checkpoint;
 f.store.execute("CREATE TRIGGER fail_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'PRIVATE'); END",[]);
 expect(()=>collector.tick('t1')).toThrow(/^collection_error$/);expect(f.store.eventCount()).toBe(0);expect(f.store.get<{checkpoint:string}>('SELECT checkpoint FROM cursors')?.checkpoint).toBe(before);
 f.store.execute('DROP TRIGGER fail_event',[]);collector.tick('t1');expect(f.store.eventCount()).toBe(1);
 f.store.execute('DELETE FROM tasks',[]);collector.tick('t1');expect(f.store.eventCount()).toBe(0);
 }finally{f.cleanup();}
});

test('truncation, identity changes and unknown formats leave earlier partial data intact',()=>{
 const f=fixture();const collector=new Collector(f.store,f.clock);
 try{f.life.start('t1');collector.tick('t1');f.turn(2,100);f.set(4);collector.tick('t1');expect(f.store.eventCount()).toBe(1);
 writeFileSync(f.source,'{"type":"unknown","private":"PRIVATE"}\n');f.set(5);collector.tick('t1');expect(f.store.eventCount()).toBe(1);
 expect(f.store.all<{status:string}>('SELECT status FROM observations').some(r=>r.status==='error')).toBe(true);
 expect(JSON.stringify(f.store.all('SELECT * FROM events'))).not.toContain('PRIVATE');
 }finally{f.cleanup();}
});
test('a generation change during a source read discards its batch',()=>{
 const f=fixture();let changed=false;const collector=new Collector(f.store,f.clock,path=>{
  const data=readFileSync(path,'utf8');if(changed)f.life.pause('t1');return {text:data,identity:'1',size:data.length,modified:data.length};
 });
 try{f.life.start('t1');collector.tick('t1');f.turn(2,100);f.set(4);changed=true;collector.tick('t1');expect(f.store.eventCount()).toBe(0);expect(f.life.state('t1')).toBe('paused');
 }finally{f.cleanup();}
});

// Both source formats can expose a completed record a few milliseconds ahead of
// the tick's fixed cutoff. Seeing that metadata must not consume its eligibility.
test.each(products)('%s retains future usage until the fixed millisecond cutoff includes it', product => {
 const f = collectionFixture(product);
 try {
  f.life.start('t1'); f.collector.tick('t1');
  f.rows(...f.turn(1, 3)); f.set(2); f.collector.tick('t1');
  expect(f.store.eventCount()).toBe(0);
  f.set(4); f.collector.tick('t1');
  expect(f.store.eventCount()).toBe(1);
  expect(f.events()).toMatchObject([{ input_total: { value: 100 }, cached_input: { value: 40 }, output_total: { value: 30 } }]);
  f.collector.tick('t1'); f.set(5); f.collector.tick('t1');
  expect(f.store.eventCount()).toBe(1);
 } finally { f.cleanup(); }
});

test.each(products)('%s counts mixed eligible/future usage at equality and late arrivals exactly once', product => {
 const f = collectionFixture(product);
 try {
  f.life.start('t1'); f.collector.tick('t1');
  const first = f.turn(1, 2, 1, 'first'); const future = f.turn(3, 6, 2, 'future');
  f.rows(...first, ...future); f.set(4); f.collector.tick('t1');
  expect(f.events()).toHaveLength(1);
  f.set(6); f.collector.tick('t1'); expect(f.events()).toHaveLength(2);
  // An appended record can predate lastAt while belonging to this same interval.
  f.rows(...first, ...future, ...f.turn(4, 5, 3, 'late')); f.set(7); f.collector.tick('t1');
  f.collector.tick('t1');
  expect(f.events()).toHaveLength(3);
  expect(f.events()).toMatchObject(Array.from({ length: 3 }, () => ({ input_total: { value: 100 }, cached_input: { value: 40 }, output_total: { value: 30 } })));
  expect(f.store.all<{ status: string }>('SELECT status FROM observations').every(row => row.status === 'excluded' || row.status === 'unmeasurable')).toBe(true);
 } finally { f.cleanup(); }
});

test.each(products)('%s defers recognized command completions and counts each logical call once', product => {
 const f = collectionFixture(product);
 try {
  f.life.start('t1'); f.collector.tick('t1');
  const rows = [f.origin(1), ...f.invocation(1), ...f.invocation(1, 'call-now'), f.completion(1, 2, 'call-now'), f.completion(1, 3)];
  f.rows(...rows); f.set(2); f.collector.tick('t1');
  expect(f.events('tool')).toMatchObject([{ call_id: 'call-now', execution: 'confirmed', outcome: 'completed' }]);
  f.set(3); f.collector.tick('t1'); f.collector.tick('t1');
  f.rows(...rows, f.completion(1, 3)); f.set(4); f.collector.tick('t1');
  expect(f.events('tool')).toHaveLength(2);
  expect(f.events('tool')).toMatchObject([{ call_id: 'call-now' }, { call_id: 'call1', boundary: product === 'codex' ? 'codex_command' : 'claude_bash' }]);
 } finally { f.cleanup(); }
});

for (const product of products) {
 test.each([0, -1, null])(`${product} excludes origin %s at or before the baseline even after deferred time passes`, origin => {
  const f = collectionFixture(product);
  try {
   f.life.start('t1'); f.collector.tick('t1');
   f.rows(...f.turn(origin, 3)); f.set(2); f.collector.tick('t1');
   f.set(4); f.collector.tick('t1'); expect(f.store.eventCount()).toBe(0);
   f.rows(...f.turn(origin, 3), ...f.turn(5, 6, 2, 'new')); f.set(6); f.collector.tick('t1');
   expect(f.events()).toHaveLength(1);
  } finally { f.cleanup(); }
 });

 test(`${product} excludes future records already present in the initial baseline`, () => {
  const f = collectionFixture(product);
  try {
   f.life.start('t1'); f.rows(...f.turn(1, 3)); f.collector.tick('t1');
   f.set(4); f.collector.tick('t1'); expect(f.store.eventCount()).toBe(0);
   f.rows(...f.turn(1, 3), ...f.turn(5, 6, 2, 'new')); f.set(6); f.collector.tick('t1');
   expect(f.events()).toHaveLength(1);
  } finally { f.cleanup(); }
 });

 test.each(['restart', 'pause', 'paused-tick'] as const)(`${product} discards deferred records across %s`, boundary => {
  const f = collectionFixture(product);
  try {
   f.life.start('t1'); f.collector.tick('t1'); f.rows(...f.turn(1, 8)); f.set(2); f.collector.tick('t1');
   let collector = f.collector;
   f.set(3);
   if (boundary === 'restart') collector = new Collector(f.store, f.clock, f.read);
   else { f.life.pause('t1'); if (boundary === 'paused-tick') collector.tick('t1'); f.life.resume('t1'); }
   collector.tick('t1'); f.set(9); collector.tick('t1'); expect(f.store.eventCount()).toBe(0);
   f.rows(...f.turn(1, 8), ...f.turn(10, 11, 2, 'new')); f.set(11); collector.tick('t1');
   expect(f.events()).toHaveLength(1);
  } finally { f.cleanup(); }
 });

 test(`${product} excludes late tool completion from a pre-baseline invocation`, () => {
  const f = collectionFixture(product);
  try {
   f.life.start('t1'); f.rows(f.origin(-1), ...f.invocation(-1)); f.collector.tick('t1');
   f.rows(f.origin(-1), ...f.invocation(-1), f.completion(-1, 3)); f.set(2); f.collector.tick('t1');
   f.set(4); f.collector.tick('t1'); expect(f.events('tool')).toHaveLength(0);
   f.rows(f.origin(-1), ...f.invocation(-1), f.completion(-1, 3), ...f.close(4), f.origin(5, 'new'), ...f.invocation(5, 'new'), f.completion(5, 6, 'new', 'new'));
   f.set(6); f.collector.tick('t1'); expect(f.events('tool')).toMatchObject([{ call_id: 'new' }]);
  } finally { f.cleanup(); }
 });
}

for (const product of products) {
 test.each(['finalize', 'delete'] as const)(`${product} performs no reads or resurrection after %s with pending usage`, boundary => {
  const f = collectionFixture(product);
  try {
   f.life.start('t1'); f.collector.tick('t1'); f.rows(...f.turn(1, 3)); f.set(2); f.collector.tick('t1');
   const reads = f.reads();
   if (boundary === 'finalize') f.life.finalize('t1', 'success', ['c1']);
   else new Deletion(f.store, f.clock).deleteTask('t1');
   f.set(4); f.collector.tick('t1'); new Collector(f.store, f.clock, f.read).tick('t1');
   expect(f.reads()).toBe(reads); expect(f.store.eventCount()).toBe(0);
   if (boundary === 'delete') {
    expect(new Deletion(f.store).isDeleted('task', 't1')).toBe(true);
    expect(f.state()).toEqual({ events: [], cursors: [], observations: [] });
   }
  } finally { f.cleanup(); }
 });
}

for (const product of products) {
 test.each(['changed-record', 'removed-record', 'identity', 'truncation', 'replacement', 'clock', 'scope', 'model'] as const)(`${product} invalidates %s with deferred metadata and preserves earlier partial usage`, fault => {
  const f = collectionFixture(product);
  try {
   f.life.start('t1'); f.collector.tick('t1');
   const first = f.turn(1, 2, 1, 'first'); const future = f.turn(3, 10, 2, 'future');
   f.rows(...first); f.set(2); f.collector.tick('t1');
   const valid = jsonLines([f.header(), ...first, ...future]);
   f.replace(valid); f.set(4); f.collector.tick('t1'); expect(f.events()).toHaveLength(1);
   const growth = '\n'.repeat(valid.length);
   if (fault === 'changed-record') f.replace(jsonLines([f.header(), ...first, ...f.turn(3, 11, 2, 'future')]) + growth);
   if (fault === 'removed-record') f.replace(jsonLines([f.header(), ...first]) + growth);
   if (fault === 'identity') f.replace(valid, { identity: 'rotated' });
   if (fault === 'truncation') f.rows(...first);
   if (fault === 'replacement') f.replace(valid.replaceAll('synthetic', 'alternate'), { modified: Buffer.byteLength(valid) + 1 });
   if (fault === 'scope') f.replace(valid.replaceAll(f.root, `${f.root}/other`) + growth);
   if (fault === 'model') f.replace(valid.replaceAll('synthetic', 'othermodel') + growth);
   f.set(fault === 'clock' ? 3 : 11); f.collector.tick('t1');
   expect(f.events()).toHaveLength(1);
   const reasons = f.store.all<{ status: string; reason: string }>('SELECT status, reason FROM observations');
   expect(reasons.at(-1)).toEqual({ status: 'error', reason: fault === 'scope' ? 'scope_mismatch' : fault === 'model' ? 'unsupported' : 'source_error' });
   // The recovery baseline consumes records from the uncertain interval.
   f.replace(valid + growth + '\n'); f.set(12); f.collector.tick('t1');
   f.set(13); f.collector.tick('t1'); expect(f.events()).toHaveLength(1);
   f.replace(jsonLines([f.header(), ...first, ...future, ...f.turn(14, 15, 3, 'new')]) + growth + '\n');
   f.set(15); f.collector.tick('t1'); expect(f.events()).toHaveLength(2);
   expect(JSON.stringify(f.state())).not.toContain(f.root);
  } finally { f.cleanup(); }
 });
}

const blockedCases: { product: typeof products[number]; boundary: string; row: unknown }[] = [
 { product: 'codex', boundary: 'reset', row: { type: 'event_msg', timestamp: '2026-01-01T00:00:00.005Z', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 30, reasoning_output_tokens: 0 } } } } },
 { product: 'codex', boundary: 'compaction', row: { type: 'compacted' } },
 { product: 'codex', boundary: 'topology', row: { type: 'event_msg', payload: { type: 'collab_begin' } } },
 { product: 'codex', boundary: 'unknown format', row: { type: 'future_format' } },
 { product: 'claude_code', boundary: 'compaction', row: { type: 'system', subtype: 'compact_boundary' } },
 { product: 'claude_code', boundary: 'topology', row: { type: 'system', isSidechain: true } },
];
test.each(blockedCases)('$product settles deferred records excluded by $boundary without later backfill', ({ product, row }) => {
 const f = collectionFixture(product);
 try {
  f.life.start('t1'); f.collector.tick('t1');
  const first = f.turn(1, 2, 1, 'first'); const future = f.turn(3, 8, 2, 'future');
  f.rows(...first, ...future); f.set(4); f.collector.tick('t1'); expect(f.events()).toHaveLength(1);
  f.rows(...first, ...future, row); f.set(5); f.collector.tick('t1');
  expect(f.store.all<{ status: string; reason: string }>('SELECT status, reason FROM observations').at(-1)).toEqual({ status: 'unmeasurable', reason: 'unsupported' });
  // Retain identical normalized records while the synthetic unsupported marker
  // disappears in a growing source. Exclusion must remain final in this interval.
  const padding = '\n'.repeat(1000);
  f.replace(jsonLines([f.header(), ...first, ...future]) + padding); f.set(9); f.collector.tick('t1');
  expect(f.events()).toHaveLength(1);
  f.replace(jsonLines([f.header(), ...first, ...future, ...f.turn(10, 11, 3, 'new')]) + padding);
  f.set(11); f.collector.tick('t1'); expect(f.events()).toHaveLength(2);
 } finally { f.cleanup(); }
});

test.each(products)('%s waits for a partial last line while retaining deferred complete records', product => {
 const f = collectionFixture(product);
 try {
  f.life.start('t1'); f.collector.tick('t1');
  const complete = [f.header(), ...f.turn(1, 8, 1, 'future'), f.origin(3, 'partial'), ...f.usage(4, 2, 'partial')];
  const text = jsonLines(complete); const tailStart = text.lastIndexOf('\n', text.length - 2) + 1;
  f.replace(text.slice(0, tailStart + 15)); f.set(5); f.collector.tick('t1'); expect(f.events()).toHaveLength(0);
  f.replace(text); f.set(6); f.collector.tick('t1'); expect(f.events()).toHaveLength(1);
  f.set(8); f.collector.tick('t1'); f.collector.tick('t1'); expect(f.events()).toHaveLength(2);
 } finally { f.cleanup(); }
});

for (const product of products) {
 for (const count of [1, 2]) {
  test.each(['event', 'cursor', 'observation'] as const)(`${product} rolls back %s failure with ${count} source(s) and retries pending eligibility`, failure => {
   const f = collectionFixture(product);
   try {
    if (count === 2) f.link('s2');
    f.life.start('t1'); f.collector.tick('t1');
    for (const sessionId of count === 2 ? ['s1', 's2'] : ['s1']) f.replace(jsonLines([f.header(sessionId), ...f.turn(1, 3, 1, 'turn1', sessionId)]), {}, sessionId);
    f.set(2); f.collector.tick('t1'); const before = f.state();
    const target = count === 2 ? 's2' : 's1';
    const earlierInserted = count === 2 ? " AND EXISTS (SELECT 1 FROM events WHERE session_id='s1')" : '';
    const trigger = failure === 'event' ? `BEFORE INSERT ON events WHEN NEW.session_id='${target}'${earlierInserted}`
     : failure === 'cursor' ? `BEFORE UPDATE ON cursors WHEN NEW.session_id='${target}'${earlierInserted}`
     : `BEFORE INSERT ON observations WHEN EXISTS (SELECT 1 FROM events WHERE session_id='${target}')${earlierInserted}`;
    f.store.execute(`CREATE TRIGGER injected_failure ${trigger} BEGIN SELECT RAISE(ABORT,'synthetic_private_error'); END`, []);
    f.set(4); expect(() => f.collector.tick('t1')).toThrow(/^collection_error$/);
    expect(f.state()).toEqual(before);
    f.store.execute('DROP TRIGGER injected_failure', []); f.collector.tick('t1');
    expect(f.store.eventCount()).toBe(count);
    f.collector.tick('t1'); expect(f.store.eventCount()).toBe(count);
    expect(JSON.stringify(f.state())).not.toContain('synthetic_private_error');
   } finally { f.cleanup(); }
  });
 }
}

test.each(products)('%s rebaselines after a generation change during a read with pending records', product => {
 const f = collectionFixture(product); let changeGeneration = false;
 const collector = new Collector(f.store, f.clock, path => {
  const bytes = f.read(path);
  if (changeGeneration) { changeGeneration = false; f.life.pause('t1'); f.life.resume('t1'); }
  return bytes;
 });
 try {
  f.life.start('t1'); collector.tick('t1'); f.rows(...f.turn(1, 8)); f.set(2); collector.tick('t1');
  f.set(3); changeGeneration = true; collector.tick('t1'); expect(f.store.eventCount()).toBe(0);
  f.set(4); collector.tick('t1'); f.set(9); collector.tick('t1'); expect(f.store.eventCount()).toBe(0);
  f.rows(...f.turn(1, 8), ...f.turn(10, 11, 2, 'new')); f.set(11); collector.tick('t1'); expect(f.events()).toHaveLength(1);
 } finally { f.cleanup(); }
});

test.each(products)('%s keeps the tick cutoff fixed when the clock advances during a read', product => {
 const f = collectionFixture(product); let advanceDuringRead = false;
 const collector = new Collector(f.store, f.clock, path => {
  if (advanceDuringRead) f.set(4);
  return f.read(path);
 });
 try {
  f.life.start('t1'); collector.tick('t1');
  f.rows(...f.turn(1, 3)); f.set(2); advanceDuringRead = true; collector.tick('t1');
  expect(f.store.eventCount()).toBe(0);
  advanceDuringRead = false; collector.tick('t1'); expect(f.store.eventCount()).toBe(1);
 } finally { f.cleanup(); }
});
