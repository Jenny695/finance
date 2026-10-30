import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createQualitativeService} from '../server/qualitative-service.js';
const now=Date.parse('2026-10-30T03:00:00Z'),product={code:'000001.OF',category:'fund',name:'测试成长混合',issuer:'测试基金管理有限公司'};
const input={code:product.code,category:'fund',days:90};
const items=[{id:'N1',title:'测试成长混合季度报告',text:'测试成长混合在季度报告中介绍了投资策略和资产配置。',excerpt:'本期季度报告',url:'https://example.com/report',scope:'product',contentLevel:'article_text',readStatus:'已读取公开正文',publishedAt:'2026-10-29T00:00:00Z'}];
function result(){const claim={text:'季度报告介绍了策略和配置。',citations:[{id:'N1',quote:'介绍了投资策略和资产配置'}]};return {overview:claim,dimensions:['strategy','management','disclosure','events'].map(id=>({id,signal:id==='strategy'?'favorable':'insufficient',...claim})),positives:[],risks:[]}}
async function setup(t,overrides={}){const directory=await mkdtemp(tmpdir()+'/qualitative-');let searches=0,models=0,nowValue=now;const calls=[];const config={AI_API_KEY:'SYNTHETIC_AI_KEY_NOT_REAL'};
 const s=createQualitativeService({directory,config,clock:()=>nowValue,context:async()=>({product}),report:()=>{throw Error('report should not be read')},crawler:{search:async()=>{searches++;return {items,status:'ready',searchedAt:new Date(now).toISOString(),days:90,attempts:[]}}},fetcher:async(url,options)=>{models++;calls.push({url,options});return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result())}}]}))},...overrides});t.after(async()=>{s.close();await rm(directory,{recursive:true,force:true})});return {s,config,calls,searches:()=>searches,models:()=>models,advance:ms=>nowValue+=ms}}
test('新闻共享缓存，AI按账号隔离并复用；所有请求凭据仅在服务端Header，模型只收证据',async t=>{
 const x=await setup(t),a={id:'a'},b={id:'b'};const news=await x.s.news(input,a);assert.equal((await x.s.news(input,b)).cached,true);assert.equal(x.searches(),1);
 const first=await x.s.analyze({...input,newsId:news.id},a);assert.equal(first.analysis.dimensions.length,4);assert.equal(x.calls[0].url,'https://api.deepseek.com/v1/chat/completions');assert.equal(JSON.parse(x.calls[0].options.body).model,'deepseek-chat');assert.ok(!x.calls[0].options.body.includes(x.config.AI_API_KEY));assert.ok(x.calls[0].options.headers.Authorization.endsWith(x.config.AI_API_KEY));
 assert.equal((await x.s.analyze({...input,newsId:news.id},a)).cached,true);assert.equal(x.models(),1);await x.s.analyze({...input,newsId:news.id},b);assert.equal(x.models(),2);
 x.advance(3600001);await assert.rejects(()=>x.s.analyze({...input,newsId:news.id},a),/过期/);
});
test('缺少AI配置只禁用AI，新闻可用；无证据不调用模型，错误不泄漏服务端密钥',async t=>{
 const x=await setup(t,{config:{}}),u={id:'a'},n=await x.s.news(input,u);assert.equal(x.s.status().aiConfigured,false);assert.equal(n.items.length,1);await assert.rejects(()=>x.s.analyze({...input,newsId:n.id},u),e=>e.status===503);assert.equal(x.models(),0);
 const empty=await setup(t,{crawler:{search:async()=>({items:[],status:'empty'})}}),snapshot=await empty.s.news(input,u);await assert.rejects(()=>empty.s.analyze({...input,newsId:snapshot.id},u),e=>e.status===422);assert.equal(empty.models(),0);
 const bad=await setup(t,{fetcher:async()=>new Response('SYNTHETIC_AI_KEY_NOT_REAL',{status:401})}),snapshot2=await bad.s.news(input,u);await assert.rejects(()=>bad.s.analyze({...input,newsId:snapshot2.id},u),e=>e.status===502&&!e.message.includes('SYNTHETIC'));
});
test('产品改名、偷用量化报告、伪造AI引用、未知参数不生成结论',async t=>{
 const x=await setup(t,{report:()=>{const e=Error('报告不存在或不属于当前账号');e.status=404;throw e}}),u={id:'a'},n=await x.s.news(input,u);
 await assert.rejects(()=>x.s.analyze({...input,name:'完全不同基金',newsId:n.id},u),e=>e.status===409);
 await assert.rejects(()=>x.s.analyze({...input,newsId:n.id,analysisId:'other-user-report'},u),e=>e.status===404);assert.equal(x.models(),0);
 await assert.rejects(()=>x.s.news({...input,token:'untrusted'},u));
 const bad=result();bad.overview.citations[0].quote='不存在的论据与结论';const y=await setup(t,{fetcher:async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(bad)}}]}))}),yn=await y.s.news(input,u);await assert.rejects(()=>y.s.analyze({...input,newsId:yn.id},u),/引用或结构/);
});
