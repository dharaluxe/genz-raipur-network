// Compatibility for the finite SQL statements used by the existing GENZ API.
// Values remain bound parameters. This is never an endpoint for caller-supplied SQL.
export type QueryResult={rows:any[];rowCount:number};
export type Executor=(sql:string,args:any[])=>Promise<QueryResult>;
export function translate(sql:string,args:any[],previousChanges=0){
 let index=0;
 let text=sql.replace(/json_extract\((\w+(?:\.\w+)?),\s*'\$\.([\w.]+)'\)/g,(_match,column,path)=>`(${column}::jsonb#>>'{${path.split('.').join(',')}}')`)
 .replace(/changes\(\)/g,String(previousChanges)).replace(/\bwindow\b/g,'"window"');
 // Do not replace question marks in quoted SQL literals.
 text=text.replace(/'(?:''|[^'])*'|\?/g,token=>token==='?'?'$'+(++index):token);
 if(index!==args.length)throw new Error('SQL parameter count mismatch');
 return {text,args};
}
export function databaseAdapter(execute:Executor,transaction:<T>(fn:(run:Executor)=>Promise<T>)=>Promise<T>){
 class Statement{
  constructor(readonly sql:string,readonly args:any[]=[]){ }
  bind(...args:any[]){return new Statement(this.sql,args);}
  async query(run:Executor=execute,previousChanges=0){const t=translate(this.sql,this.args,previousChanges);return run(t.text,t.args);}
  async first<T=any>():Promise<T|null>{return (await this.query()).rows[0]??null;}
  async all<T=any>():Promise<{results:T[]}>{return {results:(await this.query()).rows};}
  async run(){const r=await this.query();return {success:true,meta:{changes:r.rowCount}};}
 }
 return {prepare:(sql:string)=>new Statement(sql),batch:async(list:Statement[])=>transaction(async run=>{
  const out=[];let previous=0;
  for(const statement of list){const r=await statement.query(run,previous);if(previous===1&&/changes\(\)\s*=\s*1/.test(statement.sql)&&r.rowCount!==1)throw Object.assign(new Error('Concurrent update; refresh and retry'),{code:'40001'});previous=r.rowCount;out.push({success:true,meta:{changes:previous}});}
  return out;
 })};
}
