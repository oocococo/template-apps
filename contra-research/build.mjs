import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
await mkdir('dist', {recursive:true});
const speakerPath='node_modules/jsnes/src/browser/speakers.js';
const original=await readFile(speakerPath,'utf8');
const match=original.match(/const workletCode = `([\s\S]*?)`;/);
if(!match)throw new Error('Cannot extract JSNES audio worklet');
await writeFile('dist/audio-worklet.js',match[1]);
await build({entryPoints:['src/app.js'],outfile:'dist/app.js',bundle:true,format:'esm',minify:true,loader:{'.css':'text'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{
  name:'static-audio-worklet',
  setup(builder){builder.onLoad({filter:/jsnes\/src\/browser\/speakers\.js$/},async()=>({
    contents:original.replace(match[0],'')
      .replace('new window.AudioContext()','new window.AudioContext({ sampleRate: 44100 })')
      .replace('const blob = new Blob([workletCode], { type: "application/javascript" });','const audioCtx = this.audioCtx;')
      .replace('const workletUrl = URL.createObjectURL(blob);','const workletUrl = new URL("./audio-worklet.js", import.meta.url).href;')
      .replace('await this.audioCtx.audioWorklet.addModule(workletUrl);','await audioCtx.audioWorklet.addModule(workletUrl);\n    if (this.audioCtx !== audioCtx) return;')
      .replace('URL.revokeObjectURL(workletUrl);',''),loader:'js'
  }));}
}]});
await copyFile('private/contra.nes','dist/contra.nes');
console.log('Built local game and private ROM.');
