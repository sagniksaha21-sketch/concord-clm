
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const npmRoot=execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim();
const ts=(await import(pathToFileURL(path.join(npmRoot,'typescript/lib/typescript.js')).href)).default;

function walk(dir){
 return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
   const p=path.join(dir,e.name);
   if(e.isDirectory() && !['node_modules','.expo'].includes(e.name)) return walk(p);
   return e.isFile() && /\.(ts|tsx)$/.test(e.name)?[p]:[];
 });
}
const files=[...walk('app'),...walk('src')];
let failures=[];
for(const file of files){
 const text=fs.readFileSync(file,'utf8');
 const out=ts.transpileModule(text,{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
 const errs=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 if(errs.length) failures.push({file,errors:errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' '))});
}
if(failures.length){console.error(JSON.stringify(failures,null,2));process.exit(1)}
console.log(`TypeScript syntax PASS (${files.length} files)`);
