import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';

test('hospital bag progress survives saving a different scene',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
    const save=db.prepare('INSERT OR REPLACE INTO journey_checklist (id,scene,checked,updated_at) VALUES (?,?,?,?)');
    save.run('main','hospital','["hospital:0:0"]','2026-01-01');
    save.run('main','monthcenter','["monthcenter:0:0"]','2026-01-02');
    const rows=db.prepare('SELECT scene,checked FROM journey_checklist WHERE id=? ORDER BY scene').all('main');
    assert.equal(rows.length,2,'saving another scene must retain the first scene');
    assert.deepEqual(rows.map(row=>JSON.parse(row.checked)),[['hospital:0:0'],['monthcenter:0:0']]);
  }finally{db.close()}
});
