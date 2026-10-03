import { cpSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
/** Compile only local source for real SQLite worker races; never use stale dist. */
export function compiledWorker(root: string): string {
  const compiled=join(root,'compiled');mkdirSync(compiled);writeFileSync(join(compiled,'package.json'),'{"type":"module"}');
  symlinkSync(join(process.cwd(),'node_modules'),join(compiled,'node_modules'),'dir');
  for(const name of readdirSync(new URL('../../src/',import.meta.url),{recursive:true,encoding:'utf8'})){
    if(!name.endsWith('.ts'))continue;
    const output=transpileModule(readFileSync(new URL(`../../src/${name}`,import.meta.url),'utf8'),{compilerOptions:{module:ModuleKind.ESNext,target:ScriptTarget.ES2023}}).outputText;
    mkdirSync(dirname(join(compiled,name)),{recursive:true});writeFileSync(join(compiled,name.replace(/\.ts$/,'.js')),output);
  }
  cpSync(new URL('../../src/codex-admissions.json',import.meta.url),join(compiled,'codex-admissions.json'));
  cpSync(new URL('../../src/migrations/',import.meta.url),join(compiled,'migrations'),{recursive:true});return compiled;
}
