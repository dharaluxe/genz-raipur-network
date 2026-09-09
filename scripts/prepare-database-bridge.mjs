import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const queries=new Set();
function scan(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,item.name);
 if(item.isDirectory())scan(file);
 else if(file.endsWith('.ts')&&!file.endsWith('postgres-adapter.ts')){
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  function visit(node){if((ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))&&/^(SELECT|INSERT|UPDATE|DELETE)\s/.test(node.text))queries.add(node.text);ts.forEachChild(node,visit);}
  visit(source);
 }
}}
scan('lib');scan('app/api');scan('app/documents');
const target='supabase/functions/genz-database';
fs.writeFileSync(path.join(target,'queries.json'),JSON.stringify([...queries].sort(),null,2)+'\n');
fs.copyFileSync('lib/postgres-adapter.ts',path.join(target,'postgres-adapter.ts'));
console.log(`Prepared ${queries.size} allowed SQL templates`);
