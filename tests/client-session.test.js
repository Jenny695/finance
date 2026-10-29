import test from 'node:test';
import assert from 'node:assert/strict';
import {requestJSON,setViewer,viewer} from '../src/session.js';
import {setInvestorIdentity,comparisonItems,toggleComparison,addComparison,removeComparison} from '../src/comparison-store.js';
test('旧账户请求晚返回401时不能退出新账户；当前会话失效才通知页面',async()=>{const fetch=globalThis.fetch,window=globalThis.window;let finish,events=0;globalThis.window={dispatchEvent:()=>events++};try{setViewer({id:'user-a'});globalThis.fetch=()=>new Promise(resolve=>finish=resolve);const pending=requestJSON('/api/analysis/history');setViewer({id:'user-b'});finish({ok:false,status:401,json:async()=>({error:'expired'})});await assert.rejects(()=>pending,/expired/);assert.equal(events,0);assert.equal(viewer().id,'user-b');globalThis.fetch=async()=>({ok:false,status:401,json:async()=>({error:'expired'})});await assert.rejects(()=>requestJSON('/api/analysis/history'));assert.equal(events,1)}finally{globalThis.fetch=fetch;globalThis.window=window;setViewer(null)}});
test('产品对比选择按真实账户隔离，不读旧演示缓存或其他资管',()=>{const previous=globalThis.sessionStorage,values=new Map();globalThis.sessionStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};try{values.set('zh-compare',JSON.stringify([{code:'OLD.OF',category:'fund',mode:'demo'}]));setInvestorIdentity('user-a');assert.equal(comparisonItems().length,0);toggleComparison({code:'A.OF',category:'fund'});setInvestorIdentity('user-b');assert.equal(comparisonItems().length,0);toggleComparison({code:'B.YH',category:'bank'});assert.throws(()=>toggleComparison({code:'C.OF',category:'other'}));setInvestorIdentity('user-a');assert.deepEqual(comparisonItems().map(p=>p.code),['A.OF']);setInvestorIdentity(null);assert.equal(comparisonItems().length,0)}finally{globalThis.sessionStorage=previous;setInvestorIdentity(null)}});

test('无目录产品可按代码加入对比，规范代码、去重、校验类别并限制四只',()=>{
 const previous=globalThis.sessionStorage,values=new Map();globalThis.sessionStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 try{
  setInvestorIdentity('manual-compare');
  assert.equal(addComparison({code:' 180502.sz ',category:'fund'}),true);
  assert.deepEqual(comparisonItems(),[{code:'180502.SZ',category:'fund'}]);
  assert.equal(addComparison({code:'180502.SZ',category:'fund'}),false);
  assert.throws(()=>addComparison({code:'180502.SZ',category:'bank'}),/其他类别/);
  assert.throws(()=>addComparison({code:'180502.SZ',category:'__proto__'}),/类别/);
  assert.throws(()=>addComparison({code:'<script>',category:'fund'}),/完整产品代码/);
  for(const code of ['000001.OF','000003.OF','000004.OF'])addComparison({code,category:'fund'});
  assert.throws(()=>addComparison({code:'000005.OF',category:'fund'}),/最多对比4只/);
  removeComparison('000004.OF');addComparison({code:'000005.OF',category:'fund'});
  setInvestorIdentity('manual-compare');assert.equal(comparisonItems().length,4);
 }finally{globalThis.sessionStorage=previous;setInvestorIdentity(null)}
});
