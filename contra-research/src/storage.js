import { createTianaFetch } from '@tianacloud/serverless';

export async function openStorage() {
  const connection = await window.tiana.connection();
  if (connection.sql_api !== 'hrana-v3') throw new Error('当前数据库未提供 hrana-v3 接口');
  const sqlFetch = createTianaFetch({origin:connection.origin,auth:window.tiana.auth,requestBodyMode:'buffered'});
  async function execute(sql, args=[]) {
    const response = await sqlFetch(`${connection.origin}/v3/pipeline`, {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({requests:[{type:'execute',stmt:{sql,args:args.map(value=>typeof value==='number'?{type:'integer',value:String(value)}:{type:'text',value}),want_rows:true}},{type:'close'}]})
    });
    if (!response.ok) throw new Error('数据库连接失败；如正在存档，请先刷新存档列表确认结果');
    const body=await response.json();
    const statement=body.results?.[0];
    if(statement?.type!=='ok'||statement.response?.type!=='execute') throw new Error(statement?.error?.message || '数据库未确认结果，请刷新存档列表核对');
    const result=statement.response.result;
    return result.rows.map(row=>Object.fromEntries(result.cols.map((col,i)=>[col.name,row[i].value??null])));
  }
  return {
    list:hash=>execute('SELECT slot,screenshot,saved_at FROM save_slots WHERE rom_hash=? ORDER BY slot LIMIT 3',[hash]),
    get:async(hash,slot)=>(await execute('SELECT state,saved_at FROM save_slots WHERE rom_hash=? AND slot=?',[hash,slot]))[0],
    save:(hash,slot,state,screenshot,savedAt)=>execute('INSERT INTO save_slots (rom_hash,slot,state,screenshot,saved_at) VALUES (?,?,?,?,?) ON CONFLICT(rom_hash,slot) DO UPDATE SET state=excluded.state,screenshot=excluded.screenshot,saved_at=excluded.saved_at',[hash,slot,state,screenshot,savedAt])
  };
}

export async function encodeState(state) {
  const stream=new Blob([JSON.stringify(state)]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes=new Uint8Array(await new Response(stream).arrayBuffer());
  let binary='';
  for(let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
export async function decodeState(encoded) {
  const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
}
