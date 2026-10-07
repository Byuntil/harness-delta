import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { OwnedCliInvocation } from '../src/owned-cli-invocation.js';

// Node fixtures only: real products, auth, user processes and logs are excluded.
for (const mode of ['abort', 'root-exit', 'deadline'] as const) test(`owned CLI ${mode} stops an ignoring descendant and verifies the group is gone`, async () => {
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'owned-cli-fixture-')));
 try {
  const pidFile=join(dir,'child.pid'); const script=join(dir,'worker.mjs');
  writeFileSync(script,`import{spawn}from'node:child_process';import{writeFileSync}from'node:fs';const c=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});writeFileSync(${JSON.stringify(pidFile)},String(c.pid));${mode==='root-exit'?'setTimeout(()=>process.exit(0),100);':'setInterval(()=>{},1000);'}`);
  const owner=new OwnedCliInvocation({command:realpathSync(process.execPath),args:[script],cwd:dir,durationMs:mode==='deadline'?300:3000,terminationMs:1500,termGraceMs:100,stdio:'ignore'});
  const controller=new AbortController(); const resultPromise=owner.run(controller.signal);
  await expect.poll(()=>{try{return Number(readFileSync(pidFile,'utf8'))>0;}catch{return false;}},{timeout:1500}).toBe(true);
  if(mode==='abort')controller.abort();
  const result=await resultPromise;
  expect(result.terminationVerified).toBe(true); expect(owner.isAlive()).toBe(false);
  expect(()=>process.kill(-result.pid,0)).toThrow();
  expect(result.status).toBe(mode==='deadline'?'timed_out':mode==='abort'?'stopped':'completed');
  expect(result.terminationCause).toBe(mode==='deadline'?'deadline':mode==='abort'?'control':'root_exit');
  expect(result.groupChanges).toEqual([]);expect(result.groupChangesTruncated).toBe(false);
  await expect(owner.run()).rejects.toThrow('owned_cli_already_started');
 }finally{rmSync(dir,{recursive:true,force:true});}
},5000);

test('ordinary interactive launch requires a terminal before any spawn', async()=>{
 const owner=new OwnedCliInvocation({command:realpathSync(process.execPath),args:['-e','process.exit(99)'],cwd:process.cwd(),durationMs:100,stdio:'inherit'});
 if(!process.stdin.isTTY||!process.stdout.isTTY)await expect(owner.run()).rejects.toThrow('owned_cli_terminal_required');
});

test('controlling PTY is available to the ordinary child',async()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'owned-tty-fixture-')));
 try{
  const marker=join(dir,'tty.json');const script=join(dir,'worker.mjs');
  writeFileSync(script,`import{openSync,closeSync,writeFileSync}from'node:fs';const fd=openSync('/dev/tty','r+');closeSync(fd);writeFileSync(${JSON.stringify(marker)},JSON.stringify({stdin:process.stdin.isTTY,stdout:process.stdout.isTTY,devTTY:true}));setTimeout(()=>process.exit(0),150);`);
  const result=await new OwnedCliInvocation({command:realpathSync(process.execPath),args:[script],cwd:dir,durationMs:1500,termGraceMs:100,stdio:'ignore'}).run();
  expect(JSON.parse(readFileSync(marker,'utf8'))).toEqual({stdin:true,stdout:true,devTTY:true});
  expect(result).toMatchObject({status:'completed',controllingTerminal:true,terminationVerified:true});
 }finally{rmSync(dir,{recursive:true,force:true});}
},5000);

test('known escaped member is terminated and blocks qualification success',async()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'owned-escape-fixture-')));let escaped:number|undefined;
 try{
  const marker=join(dir,'escaped.pid');const script=join(dir,'worker.mjs');
  writeFileSync(script,`import{spawn}from'node:child_process';import{writeFileSync}from'node:fs';const c=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore',detached:true});c.unref();writeFileSync(${JSON.stringify(marker)},String(c.pid));setTimeout(()=>process.exit(0),400);`);
  const result=await new OwnedCliInvocation({command:realpathSync(process.execPath),args:[script],cwd:dir,durationMs:2000,termGraceMs:100,stdio:'ignore'}).run();
  escaped=Number(readFileSync(marker,'utf8'));
  expect(result).toMatchObject({status:'failed',escapedMemberObserved:true,terminationVerified:true});
  expect(result.groupChanges).toContainEqual(expect.objectContaining({pid:escaped,fromPgid:null,toPgid:escaped}));
  expect(()=>process.kill(escaped!,0)).toThrow();expect(()=>process.kill(-escaped!,0)).toThrow();
 }finally{if(escaped)try{process.kill(escaped,'SIGKILL');}catch{/* already gone */}rmSync(dir,{recursive:true,force:true});}
},5000);

test('separate PTY owner survives observer exit and verifies root/member disappearance',async()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'owned-observer-fixture-')));const pids:number[]=[];
 try{
  const payload=join(dir,'payload.mjs');const observer=join(dir,'observer.mjs');
  const rootPid=join(dir,'root.pid');const childPid=join(dir,'child.pid');const workerPid=join(dir,'owner.pid');
  writeFileSync(payload,`import{spawn}from'node:child_process';import{writeFileSync}from'node:fs';process.on('SIGTERM',()=>{});const c=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});writeFileSync(${JSON.stringify(rootPid)},String(process.pid));writeFileSync(${JSON.stringify(childPid)},String(c.pid));setInterval(()=>{},1000);`);
  const cfg={command:realpathSync(process.execPath),args:[payload],cwd:dir,durationMs:3000,terminationMs:1500,termGraceMs:100};
  writeFileSync(observer,`import{spawn}from'node:child_process';import{writeFileSync}from'node:fs';const w=spawn(${JSON.stringify(OwnedCliInvocation.pythonExecutable())},[${JSON.stringify(fileURLToPath(new URL('../scripts/owned-cli-pty.py',import.meta.url)))},${JSON.stringify(JSON.stringify(cfg))}],{stdio:['ignore','ignore','ignore','pipe']});writeFileSync(${JSON.stringify(workerPid)},String(w.pid));setTimeout(()=>process.exit(0),400);`);
  const observed=spawn(realpathSync(process.execPath),[observer],{stdio:'ignore'});
  await expect.poll(()=>{try{return Number(readFileSync(childPid,'utf8'))>0;}catch{return false;}},{timeout:2000}).toBe(true);
  for(const file of[rootPid,childPid,workerPid])pids.push(Number(readFileSync(file,'utf8')));
  expect(()=>process.kill(pids[0]!,0)).not.toThrow();
  await new Promise<void>((resolve,reject)=>{observed.once('exit',code=>code===0?resolve():reject(new Error('fixture_observer_failed')));});
  await expect.poll(()=>pids.every(pid=>{try{process.kill(pid,0);return false;}catch{return true;}}),{timeout:3500}).toBe(true);
  expect(()=>process.kill(-pids[0]!,0)).toThrow();
 }finally{for(const pid of pids)try{process.kill(pid,'SIGKILL');}catch{/* already gone */}rmSync(dir,{recursive:true,force:true});}
},7000);

test('a previously sampled member that later changes PGID remains owned and fails closed',async()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'owned-regroup-fixture-')));let escaped:number|undefined;
 try{
  const marker=join(dir,'escaped.pid');const script=join(dir,'worker.mjs');
  const py="import os,time,signal;time.sleep(.2);os.setsid();signal.signal(signal.SIGTERM,lambda *args:None);time.sleep(30)";
  writeFileSync(script,`import{spawn}from'node:child_process';import{writeFileSync}from'node:fs';const c=spawn(${JSON.stringify(OwnedCliInvocation.pythonExecutable())},['-c',${JSON.stringify(py)}],{stdio:'ignore'});c.unref();writeFileSync(${JSON.stringify(marker)},String(c.pid));setTimeout(()=>process.exit(0),500);`);
  const result=await new OwnedCliInvocation({command:realpathSync(process.execPath),args:[script],cwd:dir,durationMs:2000,termGraceMs:100,stdio:'ignore'}).run();
  escaped=Number(readFileSync(marker,'utf8'));
  expect(result).toMatchObject({status:'failed',escapedMemberObserved:true,terminationVerified:true});
  expect(result.groupChanges).toContainEqual(expect.objectContaining({pid:escaped,fromPgid:result.pid,toPgid:escaped}));
  expect(result.groupChanges.length).toBeLessThanOrEqual(16);expect(result.groupChangesTruncated).toBe(false);
  for(const change of result.groupChanges){expect(Object.keys(change).sort()).toEqual(['fromPgid','pid','ppid','startedAt','toPgid','uid']);expect(change.startedAt).toMatch(/\d{2}:\d{2}:\d{2} \d{4}$/);}
  expect(()=>process.kill(escaped!,0)).toThrow();expect(()=>process.kill(-escaped!,0)).toThrow();
 }finally{if(escaped)try{process.kill(escaped,'SIGKILL');}catch{/* already gone */}rmSync(dir,{recursive:true,force:true});}
},5000);
