import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await build({entryPoints:[path.join(root,'src/main.js')],bundle:true,write:false,format:'iife',minify:true,charset:'utf8',define:{localStorage:'demoStorage',Date:'DemoDate',setInterval:'demoSetInterval',clearInterval:'demoClearInterval'},plugins:[{name:'memory-demo',setup(b){
 b.onResolve({filter:/\/db\.js$|^\.\/db\.js$/},()=>({path:'demo-db',namespace:'memory'}));
 b.onLoad({filter:/.*/,namespace:'memory'},()=>({contents:'export async function sql(statement,args=[]){return demoSQL(statement,args)}',loader:'js'}));
 b.onResolve({filter:/style\.css$|load-style\.js$/},()=>({path:'empty',namespace:'empty'}));
 b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));
 b.onLoad({filter:/\/main\.js$/},async({path:p})=>({contents:(await readFile(p,'utf8')).replaceAll('document.addEventListener(', 'demoAddEventListener('),loader:'js'}));
 b.onLoad({filter:/\.html$/},async({path:p})=>({contents:await readFile(p,'utf8'),loader:'text'}));
}}]});
const bundle=result.outputFiles[0].text.replaceAll('</script','<\\/script');
const css=await readFile(path.join(root,'src/style.css'),'utf8');
const runtime=String.raw`
const NativeDate=Date;let demoOffset=0,demoDB,demoData={},demoTimers=new Map(),demoListeners=[];
class DemoDate extends NativeDate {constructor(...args){super(...(args.length?args:[NativeDate.now()+demoOffset]))}static now(){return NativeDate.now()+demoOffset}}
const demoStorage={getItem:key=>demoData[key]??null,setItem:(key,value)=>demoData[key]=String(value),removeItem:key=>delete demoData[key]};
function demoSetInterval(cb,ms){const id=window.setInterval(cb,ms);demoTimers.set(id,cb);return id}function demoClearInterval(id){window.clearInterval(id);demoTimers.delete(id)}
function demoAddEventListener(type,cb){document.addEventListener(type,cb);demoListeners.push([type,cb])}
function seed(){const day=n=>new NativeDate(NativeDate.now()-n*86400000).toISOString();return {profile:[{display_name:'体验者'}],sessions:[{id:'demo-s1',started_at:day(0),minutes:25,task_id:null,title:'读完一章书',tag:'阅读'},{id:'demo-s2',started_at:day(1),minutes:30,task_id:null,title:'整理本周思路',tag:'工作'},{id:'demo-s3',started_at:day(2),minutes:45,task_id:null,title:'学习一个新知识',tag:'学习'}],buildings:[{id:'demo-b1',session_id:'demo-s1',subject:'阅读',building_type:'cabin',status:'built',created_at:day(0)},{id:'demo-b2',session_id:'demo-s2',subject:'工作',building_type:'bench',status:'built',created_at:day(1)},{id:'demo-b3',session_id:'demo-s3',subject:'学习',building_type:'flower',status:'built',created_at:day(2)}],unlocks:[]}}
async function demoSQL(statement,args){const q=statement.replace(/\s+/g,' ').trim().toLowerCase();if(q.startsWith('create ')||q.startsWith('alter '))return {rows:[],affectedRows:0};let rows=[];
if(q.startsWith('select ')){if(q.includes('from study_profile'))rows=demoDB.profile;else if(q.includes('from study_sessions'))rows=demoDB.sessions;else if(q.includes('from island_buildings'))rows=demoDB.buildings;else if(q.includes('from island_unlocks'))rows=demoDB.unlocks;else throw Error('Unsupported preview query');return {rows:rows.map(row=>({...row})),affectedRows:0}}
if(q.startsWith('insert into study_profile'))demoDB.profile=[{display_name:args[1]}];
else if(q.startsWith('insert into study_sessions'))demoDB.sessions.push({id:args[0],started_at:args[2],minutes:args[3],task_id:args[4],title:args[5],tag:args[6]});
else if(q.startsWith('insert into island_buildings'))demoDB.buildings.push({id:args[0],session_id:args[2],subject:args[3],building_type:args[4],status:args[5],created_at:args[6]});
else if(q.startsWith('insert into island_unlocks'))demoDB.unlocks.push({tree_type:args[1],cost:args[2]});else throw Error('Unsupported preview write');return {rows:[],affectedRows:1}}
function boot(){for(const id of demoTimers.keys())demoClearInterval(id);for(const [type,cb] of demoListeners)document.removeEventListener(type,cb);demoListeners=[];clearTimeout(window.studyToastTimer);demoData={};demoOffset=0;demoDB=seed();window.tiana={appId:'demo'};document.getElementById('app').innerHTML='';RUN_BUNDLE}
document.getElementById('reset-demo').onclick=boot;document.getElementById('fast-demo').onclick=()=>{if(!demoTimers.size){const t=document.getElementById('toast');t.textContent='先开始一轮专注，再体验建筑落成。';t.classList.remove('hidden');return}demoOffset+=3600001;for(const cb of [...demoTimers.values()])cb()};boot();`;
const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>心屿 · 专注建岛示例</title><style>'+css+'.demo-banner{position:sticky;top:0;z-index:200;background:#eef4e4;color:#354a33;padding:8px 12px;font:13px sans-serif;display:flex;align-items:center;gap:8px;justify-content:center;flex-wrap:wrap}.demo-banner button{border:1px solid #91a880;border-radius:8px;padding:5px 8px;background:white;color:inherit}</style></head><body><div class="demo-banner"><span>示例体验，数据仅保留在本页</span><button id="fast-demo">演示完成本轮</button><button id="reset-demo">恢复示例</button></div><div id="app"></div><script>'+runtime.replace('RUN_BUNDLE',bundle)+'</script></body></html>';
if(Buffer.byteLength(html)>500000)throw Error('Preview exceeds 500 KB');await writeFile(path.join(root,'showcase/preview.html'),html);console.log('Wrote self-contained preview:',Buffer.byteLength(html),'bytes');
