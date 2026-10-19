import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await build({entryPoints:[path.join(root,'src/main.js')],bundle:true,write:false,format:'iife',minify:true,charset:'utf8',plugins:[{name:'memory-preview',setup(b){
 b.onResolve({filter:/\/db\.js$|^\.\/db\.js$/},()=>({path:'demo-db',namespace:'memory'}));
 b.onLoad({filter:/.*/,namespace:'memory'},()=>({contents:'export async function sql(statement,args=[]){return demoSQL(statement,args)}',loader:'js'}));
 b.onResolve({filter:/style\.css$|load-style\.js$/},()=>({path:'empty',namespace:'empty'}));
 b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));
 b.onLoad({filter:/\.html$/},async({path:p})=>({contents:await readFile(p,'utf8'),loader:'text'}));
}}]});
const bundle=result.outputFiles[0].text.replaceAll('</script','<\\/script');const css=await readFile(path.join(root,'src/style.css'),'utf8');
const runtime=String.raw`
let demoDB;
function seed(){return {settings:{phase:'prepare',week_number:1,started_at:new Date().toISOString(),mom_name:'妈妈',dad_name:'爸爸'},progress:[],pregnancy:[],checklist:[],comments:[{author:'爸爸',body:'今天也一起准备，把期待慢慢写下来。',created_at:new Date().toISOString()}]}}
async function demoSQL(statement,args){const q=statement.replace(/\s+/g,' ').trim().toLowerCase();if(q.startsWith('create '))return {rows:[],affectedRows:0};
if(q.startsWith('select ')){let rows;if(q.includes('from journey_settings'))rows=[demoDB.settings];else if(q.includes('from journey_progress'))rows=demoDB.progress;else if(q.includes('from journey_pregnancy'))rows=demoDB.pregnancy;else if(q.includes('from journey_checklist'))rows=demoDB.checklist;else if(q.includes('from journey_comments'))rows=demoDB.comments;else throw Error('Unsupported preview read');return {rows:rows.map(row=>({...row})),affectedRows:0}}
if(q.startsWith('delete from journey_progress'))demoDB.progress=demoDB.progress.filter(row=>row.task_id!==args[1]);
else if(q.startsWith('insert into journey_progress'))demoDB.progress.push({task_id:args[1],completed_at:args[2]});
else if(q.startsWith('insert into journey_comments'))demoDB.comments.unshift({author:args[3],body:args[4],created_at:args[5]});
else if(q.startsWith('insert or replace into journey_pregnancy'))demoDB.pregnancy=[{status:args[1],lmp_date:args[2]}];
else if(q.startsWith('insert or replace into journey_checklist')){demoDB.checklist=demoDB.checklist.filter(row=>row.scene!==args[1]);demoDB.checklist.push({scene:args[1],checked:args[2]})}
else if(q.startsWith('update journey_settings')){demoDB.settings.mom_name=args[0];demoDB.settings.dad_name=args[1]}
else throw Error('Unsupported preview write');return {rows:[],affectedRows:1}}
function boot(){clearTimeout(window.rewardTimer);demoDB=seed();document.getElementById('app').innerHTML='';RUN_BUNDLE}
document.getElementById('reset-demo').onclick=boot;boot();`;
const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>两个人，三个人 · 家庭陪伴示例</title><style>'+css+'.demo-banner{position:sticky;top:0;z-index:200;background:#f5e5dc;color:#6b4a3d;padding:8px 12px;font:13px sans-serif;display:flex;align-items:center;gap:12px;justify-content:center}.demo-banner button{border:1px solid #c5a38f;border-radius:8px;padding:5px 8px;background:#fffdf9;color:inherit}</style></head><body><div class="demo-banner"><span>示例体验，数据仅保留在本页</span><button id="reset-demo">恢复示例</button></div><div id="app"></div><script>'+runtime.replace('RUN_BUNDLE',bundle)+'</script></body></html>';
if(Buffer.byteLength(html)>500000)throw Error('Preview exceeds 500 KB');await writeFile(path.join(root,'showcase/preview.html'),html);console.log('Self-contained preview bytes:',Buffer.byteLength(html));
