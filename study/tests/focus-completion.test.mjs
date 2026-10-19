import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('completing focus saves a session and building, refreshes today, and reports success',async()=>{
  const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  const body=source.match(/async function completeFocus\([^)]*\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(body,'focus completion handler exists');
  const writes=[],buildings=[],messages=[];let todayRefreshes=0;
  const context={Date,focusMinutes:25,focusTitle:'阅读一章',focusTag:'阅读',WORKSPACE:'main',sessions:[],newId:()=> 'sample-session',
    sql:async(sql,args)=>{writes.push({sql,args});return {rows:[]}},
    saveBuilding:async(status,sessionId,minutes)=>buildings.push({status,sessionId,minutes}),checkMilestones:async()=>{},
    renderAll:()=>{},renderTodaySummary:()=>todayRefreshes++,selectedBuilding:()=>({name:'小书房'}),toast:message=>messages.push(message)};
  vm.createContext(context);vm.runInContext(body+'\nglobalThis.run=completeFocus;',context);
  await context.run(Date.UTC(2026,0,1));
  assert.equal(writes.length,1);assert.equal(context.sessions.length,1);assert.equal(buildings[0].status,'built');
  assert.equal(todayRefreshes,1,'today minutes must refresh after completion');
  assert.match(messages.at(-1),/完成了 25 分钟专注/);assert.ok(messages.every(message=>!message.includes('未保存')));
});
