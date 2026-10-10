import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, renameSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import * as workspace from '../src/harness-application-workspace.js';
const roots:string[]=[];
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_')));
function repository(){const root=realpathSync(mkdtempSync(join(tmpdir(),'application-workspace-')));roots.push(root);execFileSync('git',['init','-q',root],{env});execFileSync('git',['-C',root,'-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','commit','--allow-empty','-qm','Synthetic baseline'],{env});return root;}
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
test('pins a same-repository worktree without restricting branch names or changing Git',()=>{
 const origin=repository();const target=join(origin,'workspace');execFileSync('git',['-C',origin,'worktree','add','-qb','main-test',target],{env});
 const value=workspace.inspectApplicationWorkspace(origin,target);expect(value.root).toBe(target);expect(value.branch).toBe('main-test');expect(value.head).toHaveLength(40);expect(value.common).toBe(join(origin,'.git'));
 workspace.assertApplicationWorkspace(value);writeFileSync(join(target,'AGENTS.md'),'Synthetic uncommitted rule');workspace.assertApplicationWorkspace(value);
 expect(execFileSync('git',['-C',target,'status','--porcelain'],{encoding:'utf8',env})).toContain('AGENTS.md');
 expect(()=>workspace.inspectApplicationWorkspace(origin,repository())).toThrow('application_workspace_mismatch');
});
test('rejects symlink aliases and recreated root/admin identities even at the same path',()=>{
 const origin=repository();const target=join(origin,'workspace');execFileSync('git',['-C',origin,'worktree','add','-qb','work',target],{env});const value=workspace.inspectApplicationWorkspace(origin,target);
 const alias=join(origin,'alias');symlinkSync(target,alias);expect(()=>workspace.inspectApplicationWorkspace(origin,alias)).toThrow('application_workspace_mismatch');
 renameSync(target,target+'-old');mkdirSync(target);writeFileSync(join(target,'.git'),`gitdir: ${value.admin}\n`);expect(()=>workspace.assertApplicationWorkspace(value)).toThrow('application_workspace_changed');
});

test('ignores inherited Git routing variables when inspecting an explicit workspace',()=>{
 const origin=repository(),other=repository();const previous=process.env.GIT_DIR;process.env.GIT_DIR=join(other,'.git');
 try{expect(workspace.inspectApplicationWorkspace(origin,origin).common).toBe(join(origin,'.git'));}finally{if(previous===undefined)delete process.env.GIT_DIR;else process.env.GIT_DIR=previous;}
});
