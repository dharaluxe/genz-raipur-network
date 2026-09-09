// Private server-to-server transport. Browsers never receive the bridge key.
export function httpDatabase(){
 async function request(operation:string,statements:{sql:string;args:any[]}[]){
  const url=process.env.GENZ_DATABASE_ENDPOINT,key=process.env.GENZ_DATABASE_KEY;
  if(!url||!key)throw new Error('GENZ database connection is not configured');
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({operation,statements}),signal:AbortSignal.timeout(25000)});
  const result:any=await response.json();
  if(!response.ok)throw Object.assign(new Error('Database operation failed'),{code:result.code});
  return result;
 }
 class Statement{
  constructor(readonly sql:string,readonly args:any[]=[]){ }
  bind(...args:any[]){return new Statement(this.sql,args);}
  async first<T=any>():Promise<T|null>{return (await request('query',[this])).rows[0]??null;}
  async all<T=any>():Promise<{results:T[]}>{return {results:(await request('query',[this])).rows};}
  async run(){const r=await request('query',[this]);return {success:true,meta:{changes:r.rowCount}};}
 }
 return {prepare:(sql:string)=>new Statement(sql),batch:(statements:Statement[])=>request('batch',statements)};
}
