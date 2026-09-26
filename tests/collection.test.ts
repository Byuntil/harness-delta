import { appendFileSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from 'vitest';
import { Store } from '../src/store.js';
import { Lifecycle } from '../src/lifecycle.js';
import { Collector } from '../src/collection.js';
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
