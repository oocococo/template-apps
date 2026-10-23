import {createServer} from 'node:http';
import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const args = process.argv.slice(2);
const rootAt = args.indexOf('--root');
if (rootAt<0 || !args[rootAt+1]) throw new Error('Pass --root TASK_ROOT explicitly');
const root = resolve(args[rootAt+1]);
const source = dirname(fileURLToPath(import.meta.url));
const port = Number(args[args.indexOf('--port')+1] || 4196);
if (!Number.isInteger(port) || port < 1024 || port>65535) throw new Error('Invalid local port');
const mediaRoot = join(root,'artifacts/media-candidates');
const allowed = new Set(['still.webp','video.mp4','animation.webp','animation.gif','motion.glb','render.json']);
const types = {webp:'image/webp',mp4:'video/mp4',gif:'image/gif',glb:'model/gltf-binary',json:'application/json',html:'text/html; charset=utf-8'};

async function candidates() {
  const out=[];
  for (const entry of await readdir(mediaRoot,{withFileTypes:true})) {
    if (!entry.isDirectory() || !/^[a-z_]+$/.test(entry.name)) continue;
    const attempts = await readdir(join(mediaRoot,entry.name),{withFileTypes:true});
    for (const attempt of attempts) {
      if (!attempt.isDirectory() || !/^(preview|final)(-\d+)?$/.test(attempt.name)) continue;
      try {
        const report=JSON.parse(await readFile(join(mediaRoot,entry.name,attempt.name,'render.json')));
        if (!report.artifacts) continue;
        out.push({id:entry.name,attempt:attempt.name,frames:report.frames,quality:report.quality,
          loopDelta:report.maxLoopJointDeltaMetres,source:report.source,inputsUnchanged:report.inputsUnchanged,
          url:`/media/${entry.name}/${attempt.name}/`});
      } catch(error) { if (error.code !== 'ENOENT') console.error(entry.name,attempt.name,error.message); }
    }
  }
  return out;
}

createServer(async(req,res)=>{
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {res.writeHead(405).end();return;}
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (path==='/manifest.json') {
      res.writeHead(200,{'Content-Type':types.json,'Cache-Control':'no-store'});
      res.end(JSON.stringify({target:5632,policy:'全部补齐后统一上线',candidates:await candidates()}));return;
    }
    let file;
    if (path==='/') file=join(source,'review.html');
    else {
      const match=path.match(/^\/media\/([a-z_]+)\/((?:preview|final)(?:-\d+)?)\/([^/]+)$/);
      if (!match || !allowed.has(match[3])) {res.writeHead(404).end();return;}
      file=join(mediaRoot,match[1],match[2],match[3]);
      if(relative(mediaRoot,file).startsWith('..')) {res.writeHead(403).end();return;}
    }
    const bytes=await readFile(file);
    res.writeHead(200,{'Content-Type':types[file.split('.').pop()]||'application/octet-stream','Content-Length':bytes.length,
      'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:bytes);
  } catch(error) {res.writeHead(error.code==='ENOENT'?404:500).end('Unavailable');}
}).listen(port,'127.0.0.1',()=>console.log(`Media review: http://127.0.0.1:${port}/`));
