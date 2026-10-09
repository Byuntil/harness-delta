import { execFileSync } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
const identitySchema=z.strictObject({dev:z.string(),ino:z.string(),birth:z.string()});
export const ApplicationWorkspaceSchema=z.strictObject({root:z.string(),origin:z.string(),common:z.string(),admin:z.string(),root_identity:identitySchema,admin_identity:identitySchema,common_identity:identitySchema,head:z.string(),branch:z.string()});
export type ApplicationWorkspace=z.infer<typeof ApplicationWorkspaceSchema>;
function identity(path:string){const stat=lstatSync(path,{bigint:true});if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('application_workspace_mismatch');return {dev:String(stat.dev),ino:String(stat.ino),birth:String(stat.birthtimeNs)};}
function git(root:string,...args:string[]){return execFileSync('git',['-C',root,...args],{encoding:'utf8',timeout:5000,maxBuffer:1048576,stdio:['ignore','pipe','ignore'],env:{...Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_'))),GIT_OPTIONAL_LOCKS:'0',GIT_CONFIG_NOSYSTEM:'1'}}).trim();}
/** Read-only Git inspection. No branch policy and no worktree creation. */
export function inspectApplicationWorkspace(originRoot:string,selectedRoot:string):ApplicationWorkspace {
 try {
  const root=realpathSync(selectedRoot),origin=realpathSync(originRoot);
  if(root!==resolve(selectedRoot)||origin!==resolve(originRoot)||git(root,'rev-parse','--show-toplevel')!==root||git(origin,'rev-parse','--show-toplevel')!==origin||git(root,'rev-parse','--show-superproject-working-tree'))throw new Error('scope');
  const common=realpathSync(git(root,'rev-parse','--path-format=absolute','--git-common-dir'));
  const admin=realpathSync(git(root,'rev-parse','--absolute-git-dir'));
  if(common!==realpathSync(git(origin,'rev-parse','--path-format=absolute','--git-common-dir')))throw new Error('scope');
  const members=git(origin,'worktree','list','--porcelain','-z').split('\0').filter(part=>part.startsWith('worktree ')).map(part=>part.slice(9));
  if(!members.includes(root))throw new Error('scope');
  return {root,origin,common,admin,root_identity:identity(root),admin_identity:identity(admin),common_identity:identity(common),head:git(root,'rev-parse','HEAD'),branch:git(root,'branch','--show-current')};
 } catch {throw new Error('application_workspace_mismatch');}
}
/** Branch/HEAD may advance later; filesystem replacement may not. */
export function assertApplicationWorkspace(input:ApplicationWorkspace):void {
 try {const expected=ApplicationWorkspaceSchema.parse(input);const current=inspectApplicationWorkspace(expected.origin,expected.root);
  for(const key of ['root','origin','common','admin','root_identity','admin_identity','common_identity'] as const)if(JSON.stringify(current[key])!==JSON.stringify(expected[key]))throw new Error('changed');
 }catch{throw new Error('application_workspace_changed');}
}
