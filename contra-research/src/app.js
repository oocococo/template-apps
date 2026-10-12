import { Browser, Controller } from 'jsnes';
import { openStorage, encodeState, decodeState } from './storage.js';
import css from './style.css';
const style=document.createElement('style');style.textContent=css;document.head.append(style);
document.title='魂斗罗 · 单人游戏';
document.querySelector('#app').innerHTML=`<div class="shell">
<header><div class="brand">魂斗罗<span> / </span><em>CONTRA</em></div><div class="edition">NES · USA / 1988<br>单人游戏 · 私人研究</div></header>
<main><section class="console" aria-label="游戏机"><div class="bezel"><div id="screen" class="screen"><div class="overlay" id="overlay"><button id="play" disabled>正在载入卡带…</button></div></div><div class="screen-label"><span><i class="power"></i>PLAYER 1</span><span>256 × 240 · ORIGINAL PIXELS</span></div></div>
<div class="toolbar"><button id="pause" class="primary" disabled>暂停</button><button id="reset" disabled>重新开始</button><button id="fullscreen">全屏</button><div class="vents" aria-hidden="true"></div></div>
<div class="controls"><span><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd>移动 / 瞄准</span><span><kbd>Z</kbd>射击 <kbd>X</kbd>跳跃</span><span><kbd>Enter</kbd>开始 <kbd>Esc</kbd>暂停</span></div>
<div class="touch" aria-label="触屏控制"><div class="dpad"><button data-key="UP" aria-label="向上">▲</button><button data-key="LEFT" aria-label="向左">◀</button><button data-key="RIGHT" aria-label="向右">▶</button><button data-key="DOWN" aria-label="向下">▼</button></div><button class="start" data-key="START">START</button><div class="ab"><button data-key="B">B<small>射击</small></button><button data-key="A">A<small>跳跃</small></button></div></div></section>
<aside><div class="aside-head"><h1>游戏存档</h1><button id="refresh" class="link">刷新</button></div><p class="sub">随时保存，接着上次的地方玩。<br><span id="db-status">正在连接 Tiana SQLite…</span></p><div id="slots" class="slots"></div><p id="notice" role="status" aria-live="polite">载入原版卡带后，点击开始游戏。</p></aside></main><footer><span>原版运行 · JSNES 2.1.0</span><span>方向键 + Z / X · 支持手柄</span></footer></div>`;
const $=id=>document.getElementById(id);
let emulator, storage, romHash, loaded=false, running=false, busy=false, saved=new Map();
const notice=message=>$('notice').textContent=message;
const buttonMap={38:Controller.BUTTON_UP,40:Controller.BUTTON_DOWN,37:Controller.BUTTON_LEFT,39:Controller.BUTTON_RIGHT,90:Controller.BUTTON_B,88:Controller.BUTTON_A,13:Controller.BUTTON_START};
function releaseButtons(){if(emulator)for(let i=0;i<8;i++)emulator.nes.buttonUp(1,i);}
function setRunning(value){
  if(!loaded||running===value)return;
  releaseButtons();running=value;
  if(value)emulator.start();else emulator.stop();
  $('overlay').hidden=value;$('play').textContent='继续游戏';$('pause').textContent=value?'暂停':'继续';
}
function render(){
  $('slots').replaceChildren();
  for(let slot=1;slot<=3;slot++){
    const record=saved.get(slot),article=document.createElement('article');article.className='slot';
    article.innerHTML=`<div class="slot-head"><strong>SLOT 0${slot}</strong><time></time></div><div class="slot-preview"></div><div class="slot-actions"><button data-save="${slot}">${record?'覆盖存档':'保存'}</button><button data-load="${slot}">读取</button></div>`;
    article.querySelector('time').textContent=record?new Date(record.saved_at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'空存档';
    const preview=article.querySelector('.slot-preview');
    if(record){const img=document.createElement('img');img.src=record.screenshot;img.alt=`存档 ${slot} 的游戏画面`;preview.append(img);}else preview.textContent='— NO DATA —';
    article.querySelector('[data-save]').disabled=busy||!loaded||!storage;
    article.querySelector('[data-load]').disabled=busy||!loaded||!storage||!record;
    $('slots').append(article);
  }
  $('refresh').disabled=busy||!storage;
  $('reset').disabled=busy||!loaded;
  $('pause').disabled=busy||!loaded;
  $('play').disabled=busy||!loaded;
}
async function refresh(){saved=new Map((await storage.list(romHash)).map(row=>[Number(row.slot),row]));render();}
async function operation(action){
  if(busy)return;busy=true;render();
  try{await action();}catch(error){notice(error.message);}finally{busy=false;render();}
}
$('slots').addEventListener('click',event=>{
  const save=event.target.closest('[data-save]'),load=event.target.closest('[data-load]');
  if(!save&&!load)return;
  operation(async()=>{
    setRunning(false);
    const slot=Number((save||load).dataset[save?'save':'load']);
    if(save){
      notice(`正在保存到存档 ${slot}…`);
      const state=await encodeState(emulator.nes.toJSON());
      const screenshot=emulator.screenshot().src,savedAt=new Date().toISOString();
      await storage.save(romHash,slot,state,screenshot,savedAt);
      await refresh();notice(`存档 ${slot} 已保存至 Tiana SQLite。点击继续游戏。`);
    }else{
      notice(`正在读取存档 ${slot}…`);
      const record=await storage.get(romHash,slot);
      if(!record)throw new Error('此存档已不存在，请刷新列表');
      emulator.nes.fromJSON(await decodeState(record.state));releaseButtons();
      setRunning(true);notice(`已恢复存档 ${slot}。`);
    }
  });
});
$('refresh').onclick=()=>operation(async()=>{await refresh();notice('存档列表已更新。');});
$('play').onclick=()=>{setRunning(true);notice('按 Enter 开始单人游戏。Z 射击，X 跳跃。');};
$('pause').onclick=()=>setRunning(!running);
$('reset').onclick=()=>{setRunning(false);emulator.nes.reloadROM();setRunning(true);notice('已重新启动卡带，按 Enter 开始。');};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('screen').requestFullscreen();}catch{notice('此浏览器不支持全屏，请横屏游玩。');}};
window.addEventListener('keydown',event=>{if(event.code==='Escape'&&!busy){setRunning(false);return;}});
window.addEventListener('blur',()=>setRunning(false));
document.addEventListener('visibilitychange',()=>{if(document.hidden)setRunning(false);});
for(const button of document.querySelectorAll('[data-key]')){
  const code=Controller[`BUTTON_${button.dataset.key}`];
  button.onpointerdown=event=>{event.preventDefault();if(!running)return;button.setPointerCapture(event.pointerId);emulator.nes.buttonDown(1,code);};
  button.onpointerup=button.onpointercancel=button.onlostpointercapture=()=>emulator?.nes.buttonUp(1,code);
}
render();
async function init(){
  const response=await fetch(new URL('./contra.nes',import.meta.url));
  if(!response.ok)throw new Error('卡带加载失败，请检查本地构建的 contra.nes');
  const bytes=new Uint8Array(await response.arrayBuffer());
  romHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  emulator=new Browser({container:$('screen'),onError:error=>{running=false;$('overlay').hidden=false;notice(`游戏运行停止：${error.message}`);}});
  emulator.keyboard.keys=Object.fromEntries(Object.entries(buttonMap).map(([key,button])=>[key,[1,button]]));
  emulator.nes.loadROM(bytes);
  loaded=true;$('play').textContent='开始游戏';render();
  new ResizeObserver(()=>emulator.fitInParent()).observe($('screen'));
  try{storage=await openStorage();await refresh();$('db-status').textContent='Tiana SQLite 已连接';}
  catch(error){$('db-status').textContent='云存档连接失败';notice(error.message);}
  render();
}
init().catch(error=>{notice(error.message);$('play').textContent='载入失败';});
