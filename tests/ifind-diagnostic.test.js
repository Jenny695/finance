import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
test('最小诊断默认不调用上游、不回显环境凭据、不修改数据库',async()=>{
 const root=await mkdtemp(tmpdir()+'/ifind-check-');try{
  await mkdir(root+'/.public-data');await writeFile(root+'/.env','IFIND_REFRESH_TOKEN=SYNTHETIC_PRIVATE_REFRESH\nADMIN_PASSWORD=SYNTHETIC_PRIVATE_PASSWORD\n');
  const db=new DatabaseSync(root+'/.public-data/finance.sqlite');db.exec('CREATE TABLE analysis_runs(data TEXT,updated_at TEXT)');db.prepare('INSERT INTO analysis_runs VALUES(?,?)').run(JSON.stringify({code:'000001.OF',category:'fund',start:'2026-01-01',end:'2026-10-29',state:'paused-error',lastFailure:{message:'SYNTHETIC_PRIVATE_REFRESH'}}),'2026-10-30');db.close();
  const result=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/check-ifind.js',import.meta.url))],{cwd:root,env:{PATH:process.env.PATH}});assert.ok(result.stdout.includes('000001.OF'));assert.ok(result.stdout.includes('加 --live'));assert.ok(!result.stdout.includes('SYNTHETIC_PRIVATE'));
  const after=new DatabaseSync(root+'/.public-data/finance.sqlite',{readOnly:true});assert.equal(after.prepare('SELECT count(*) n FROM analysis_runs').get().n,1);after.close();
 }finally{await rm(root,{recursive:true,force:true})}
});
