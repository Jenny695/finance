import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createMarketData} from '../server/market-data.js';
const plan={endpoint:'date_sequence',payload:{codes:'SYNTH.OF',startdate:'20260101',enddate:'20260501',indipara:[{indicator:'ths_unit_nv_fund',indiparams:[]}]}};
const response={source:{provider:'Synthetic test only',url:'https://example.com/fixture',title:'Test',retrievedAt:'2026-10-29T00:00:00Z'},data:{errorcode:0,tables:[]}};
test('只缓存成功官方数据；同参数跨账号复用、重启持久化、窗口或凭据变更与过期均重新查询',async t=>{
 const directory=await mkdtemp(tmpdir()+'/market-data-');let now=100000,calls=0,consumed=[];const config={IFIND_ACCESS_TOKEN:'TEST_ONLY'};
 const options={directory,config,clock:()=>now,consume:id=>consumed.push(id),query:async()=>{calls++;return response}};let service=createMarketData(options);
 t.after(async()=>{service.close();await rm(directory,{recursive:true,force:true})});
 assert.equal((await service.read(plan,{id:'admin'})).cacheHit,false);
 assert.equal((await service.read(plan,{id:'investor'})).cacheHit,true);assert.deepEqual(consumed,['admin']);assert.equal(calls,1);
 service.close();service=createMarketData(options);assert.equal((await service.read(plan,{id:'investor'})).cacheHit,true);assert.equal(calls,1);
 const changed=structuredClone(plan);changed.payload.enddate='20260502';assert.equal((await service.read(changed,{id:'investor'})).cacheHit,false);
 config.IFIND_ACCESS_TOKEN='ROTATED_TEST_ONLY';assert.equal((await service.read(plan,{id:'investor'})).cacheHit,false);
 now+=900001;assert.equal((await service.read(plan,{id:'investor'})).cacheHit,false);assert.equal(calls,4);
});
test('请求失败不缓存且不向其他账号提供私有内容；并发相同请求只调用一次上游',async t=>{
 const directory=await mkdtemp(tmpdir()+'/market-failure-');let calls=0,fail=true,consumed=0;
 const service=createMarketData({directory,config:{},consume:()=>consumed++,query:async()=>{calls++;await new Promise(r=>setTimeout(r,10));if(fail)throw Error('synthetic failure');return response}});
 t.after(async()=>{service.close();await rm(directory,{recursive:true,force:true})});
 await assert.rejects(()=>service.read(plan,{id:'admin'}));fail=false;
 const results=await Promise.all([service.read(plan,{id:'admin'}),service.read(plan,{id:'investor'})]);assert.equal(calls,2);assert.equal(consumed,2);assert.deepEqual(results.map(x=>x.cacheHit),[false,true]);assert.ok(results.every(x=>!('user' in x)&&!('decisionProfile' in x)));
});
