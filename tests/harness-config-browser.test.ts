import { createServer } from 'node:net';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { localWebFixture } from './helpers/local-web-fixture.js';
import { registerHarness, generateComparison } from '../src/harness-config.js';
import { comparisonVariant } from '../src/comparison.js';
import { createLocalWebDomain } from '../src/local-web-domain.js';
import { createLocalWebServer } from '../src/local-web-server.js';

// Explicit optional browser exercise, isolated from production DBs and servers.
// A browser must import, explicitly bind, and create one inactive task.
test.skipIf(process.env.HARNESS_DELTA_UI_SMOKE!=='1')('browser binds a portable pair and prepares one synthetic task',async()=>{
 const f=localWebFixture();writeFileSync(join(f.project,'notes.md'),'Synthetic browser exercise prerequisites\n');
 for(const [i,version] of ['baseline','v2'].entries()){
  writeFileSync(join(f.project,'policy.md'),readFileSync(f.input.artifacts[i]!.selected_artifacts[0]!.path));
  registerHarness(f.project,{schema_version:1,harness_id:'search',version,policy_version:comparisonVariant(f.store,f.input.artifacts[i]!.variant_id).policy_version,readme_path:'notes.md',artifacts:[{artifact_id:'instruction',role:'instruction',source_path:'policy.md',target_path:'harness.md'}]});
 }
 generateComparison(f.project,{schema_version:1,id:'baseline-vs-v2',name:'Synthetic browser pair',arm_a:'baseline',arm_b:'v2'});
 const socket=createServer();await new Promise<void>(done=>socket.listen(0,'127.0.0.1',done));const address=socket.address();if(!address||typeof address==='string')throw new Error('synthetic_port_unavailable');const port=address.port;await new Promise<void>(done=>socket.close(()=>done()));
 const origin=`http://127.0.0.1:${port}`;const domain=createLocalWebDomain({store:f.store,metadataFile:f.metadataFile,profiles:[f.profile],picker:()=>Promise.resolve(join(f.project,'harness-config/comparisons/baseline-vs-v2.json'))});const app=createLocalWebServer({origin,domain,metadataFile:f.metadataFile,uiRoot:resolve('dist/local-ui')});
 try{
  await app.listen({host:'127.0.0.1',port});process.stdout.write(`SYNTHETIC_BROWSER_ORIGIN=${origin}\n`);
  const end=Date.now()+210000;while(Date.now()<end&&f.store.all('SELECT id FROM tasks').length===0)await delay(200);
  expect(f.store.all('SELECT state FROM tasks')).toEqual([{state:'registered'}]);expect(f.store.all('SELECT id FROM comparison_assignments')).toHaveLength(1);expect(f.store.all('SELECT * FROM active_intervals')).toHaveLength(0);expect(f.store.eventCount()).toBe(0);
  await delay(5000);
  const db=new Database(f.metadataFile);expect(db.prepare('SELECT id FROM web_profiles').all()).toHaveLength(2);db.close();
 }finally{await app.close();f.cleanup();}
},240000);
