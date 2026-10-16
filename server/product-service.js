import {extraIndicators,parseOfficialIndicators,BANK_DRAWDOWN_FIELD} from '../lib/official-indicators.js';
import {openDatabase,digest} from './database.js';
import {queryDates} from '../lib/catalog.js';
import {referenceFor,searchPublicReferences} from './enrichment.js';
import {diagnoseSeries,evidenceReadiness} from '../lib/diagnostics.js';
import {bankTemplate,initialCatalog} from './default-templates.js';
import { readFile,mkdir,writeFile,rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { queryIFind,ConnectorError } from './connectors.js';
import { catalogRows,validateTemplate,templateQuery,CODE_PATTERN,CATEGORIES } from '../lib/catalog.js';
import { ifindSeries } from '../lib/import.js';
import { assess,calculateMetrics,assessEvidenceOnly } from '../lib/assessment.js';
const directory=fileURLToPath(new URL('../.local/',import.meta.url));
export function createProductService({query=queryIFind,folder=directory,config=process.env,clock=()=>Date.now(),defaults=true}={}){
 let state=null,loading=null,db=null;let stateRevision=0;let syncing=false,nextSyncAt=0;let updates=Promise.resolve();const cache=new Map(),pending=new Map();
 const account=()=>digest(config.IFIND_ACCESS_TOKEN||config.IFIND_REFRESH_TOKEN||'none');
 const basis=template=>digest({...template,updatedAt:undefined,verification:undefined});
 async function load(){if(state)return state;if(loading)return loading;loading=(async()=>{let data;try{data=JSON.parse(await readFile(folder+'/catalog.json','utf8'));if(!Array.isArray(data.products)||!Array.isArray(data.templates))throw Error()}catch(e){if(e.code!=='ENOENT')throw new ConnectorError('本机产品配置无法读取，请检查.local/catalog.json，未自动覆盖',500);data={products:defaults?structuredClone(initialCatalog):[],templates:defaults?[structuredClone(bankTemplate)]:[]}}const preset=data.templates.find(t=>t.category==='bank'&&t.field==='ths_unit_nv_fund'&&t.officialRiskEnabled!==false&&t.basisConfirmed===false&&String(t.verification).startsWith('依据用户'));if(preset&&!preset.payload.indipara.some(i=>i.indicator===BANK_DRAWDOWN_FIELD)){preset.payload.indipara.push({indicator:BANK_DRAWDOWN_FIELD,indiparams:['']});preset.officialIndicators=extraIndicators(preset.payload,preset.field)}db=openDatabase(folder);db.migrate(data.products);state=data;return data})();try{return await loading}finally{loading=null}}
 async function change(fn){const task=updates.then(async()=>{const current=await load();const next=structuredClone(current);fn(next);await mkdir(folder,{recursive:true});await writeFile(folder+'/catalog.tmp',JSON.stringify(next,null,2),'utf8');await rename(folder+'/catalog.tmp',folder+'/catalog.json');state=next;stateRevision++;cache.clear();return next});updates=task.catch(()=>{});return task}
 async function status(){const data=await load();return {configured:!!(config.IFIND_REFRESH_TOKEN||config.IFIND_ACCESS_TOKEN),products:db.productCount(),templates:data.templates.map(({category,field,updatedAt,verification,officialIndicators=[]})=>({category,field,updatedAt,verification,officialIndicators})),supports:Object.keys(CATEGORIES),scope:'本机数据库已导入的目录，非同花顺全市场产品库'} }
 async function catalog(params={}){const data=await load();const result=db.catalog(params);return {...result,items:result.items.map(p=>({...p,queryReady:data.templates.some(t=>t.category===p.category)})),mode:'live-catalog',scope:'SQLite已导入的产品目录；不代表全市场覆盖'}}
 async function importCatalog(products){const valid=catalogRows(products);await load();db.upsertProducts(valid);stateRevision++;cache.clear();return {imported:valid.length,...await status()}}
 async function saveTemplate(input){const template=validateTemplate(input);await change(data=>{data.templates=data.templates.filter(t=>t.category!==template.category);data.templates.push(template)});return {category:template.category,field:template.field,saved:true}}
 async function detail({code,category,start,end,refresh=false}){
  if(!CODE_PATTERN.test(code||''))throw new ConnectorError('请输入有效产品代码');
  const data=await load();const known=db.product(code);const selectedCategory=known?.category||category;
  const template=data.templates.find(t=>t.category===selectedCategory);if(!template)throw new ConnectorError('该类别尚未配置真实净值指标。请在“数据连接”导入官方查询模板后再查询；不会猜测字段或用股票价格替代',409);
  let input;try{input=templateQuery(template,code,start,end)}catch(e){throw new ConnectorError(e.message)}
  const identity=account();
  const key=createHash('sha256').update(JSON.stringify({identity,input,template:template.updatedAt,stateRevision})).digest('hex');
  if(!refresh&&cache.has(key)&&clock()-cache.get(key).time<300000)return {...cache.get(key).value,cached:true};
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{
   const raw=await query(input);let series;try{series=ifindSeries(raw.data,template.field,code,{allowMissing:true})}catch(e){throw new ConnectorError(e.message,422)}
   // Blank留下的空观测会被移除并明确计数，绝不填0或沿用前值。
   const source={...raw.source,title:`${known?.name||code} · ${template.field} · ${start}—${end}`};
   const reference=referenceFor(code,{confirmed:!!data.referenceMatches?.[code],now:new Date(clock()).toISOString().slice(0,10)});
   const base={...known,code,name:known?.name||code,category:selectedCategory,issuer:known?.issuer||'机构待核对',metadataStatus:known?'目录资料待核对':'仅查询代码，登记信息待补充',type:known?.type||null,riskLevel:known?.riskLevel||null,currency:known?.currency||template.currency||null};
   let metrics;try{metrics=calculateMetrics(series,{periodsPerYear:template.periodsPerYear})}catch(e){throw new ConnectorError(e.message,422)}
   const diagnostics=diagnoseSeries(series,{navBasis:template.navBasis,distributions:template.distributions,periodsPerYear:template.periodsPerYear,source,requestedStart:start,requestedEnd:end,missingObservations:series.missingCount||0});
   if(diagnostics.flatUnit){metrics.annualizedReturn=null;metrics.volatility=null;metrics.downside=null;metrics.sharpe=null;}
   if(reference?.identityConfirmed){base.name=reference.name;base.registrationCode=reference.registrationCode;base.riskLabel=reference.facts.riskLabel;base.type=base.type||reference.facts.type;}
   const evidence=reference?.identityConfirmed?reference.evidence:{};
   let assessment=null;const scoringReason=[];
   if(diagnostics.flatUnit)scoringReason.push('单位净值长期不变，不能据此得出零收益、零风险。需要收益分配、万份收益或真实总回报序列。');
   if(!base.type||!base.riskLevel||!base.currency)scoringReason.push('缺少资产分类、风险等级或币种，暂不计算维度分。');
   if(template.distributions==='unknown'&&template.navBasis==='unit')scoringReason.push('尚未确认分红情况，单位净值不能直接作为总回报序列评分。');
   if(template.basisConfirmed===false)scoringReason.push('预置模板尚未核对费用和采样口径，先展示净值变化，暂不生成评分。');
   if(!scoringReason.length)assessment=assess({id:code,name:base.name,type:base.type,riskLevel:base.riskLevel,currency:base.currency,series,source,navBasis:template.navBasis,feeBasis:template.feeBasis,hasDistributions:template.distributions==='yes',options:{periodsPerYear:template.periodsPerYear},evidence,peers:[]});
   if(!assessment&&Object.keys(evidence).length)assessment=assessEvidenceOnly({name:base.name,evidence,reason:scoringReason.join(' ')});
   const readiness=evidenceReadiness({product:base,source,diagnostics,evidence});
   const officialIndicators=parseOfficialIndicators(raw.data,extraIndicators(input.payload,template.field),code,source);
   const value={officialIndicators,product:base,diagnostics,readiness,reference,evidence,series,metrics,assessment,source,navBasis:template.navBasis,distributions:template.distributions,field:template.field,missingObservations:series.missingCount||0,mode:'live',cached:false,queriedAt:new Date(clock()).toISOString(),scoringReason,notice:'本次iFinD授权查询成功；登记信息、披露资料与指标含义仍需核对。没有原文证据的非净值维度不评分。',requestRange:{start,end}};
   const savedAt=db.saveSnapshot(value,{account:identity,basis:basis(template)});value.storage={kind:'fresh',savedAt};
   cache.set(key,{time:clock(),value});if(cache.size>100)cache.delete(cache.keys().next().value);return value;
  })();pending.set(key,task);try{return await task}finally{pending.delete(key)}
 }
 async function reference(code){if(!CODE_PATTERN.test(code||''))throw new ConnectorError('产品代码无效');const data=await load();return {reference:referenceFor(code,{confirmed:!!data.referenceMatches?.[code]}),notice:'历史官网资料与当前净值区间分开呈现，搜索摘要不计入评分'}}
 async function confirmReference({code,registrationCode,confirmed}){const ref=referenceFor(code);if(!ref||registrationCode!==ref.registrationCode||confirmed!==true)throw new ConnectorError('请对照官网报告确认产品名称、管理人和登记编码，再确认映射');await change(data=>{data.referenceMatches||={};data.referenceMatches[code]={registrationCode,confirmedAt:new Date().toISOString(),basis:'用户对照原文确认映射'}});return reference(code)}
 async function searchReferences({code}){const data=await load();const p=db.product(code);if(!p)throw new ConnectorError('先导入产品名称和机构，才能可靠匹配公开资料');return searchPublicReferences(p)}
 async function enableBankRisk({enabled=true}={}){if(typeof enabled!=='boolean')throw new ConnectorError('请明确是否启用附加回撤指标');await change(data=>{const t=data.templates.find(t=>t.category==='bank');if(!t||t.endpoint!=='date_sequence')throw new ConnectorError('请先配置银行理财日期序列模板',409);t.payload.indipara=t.payload.indipara.filter(i=>i.indicator!==BANK_DRAWDOWN_FIELD);if(enabled)t.payload.indipara.push({indicator:BANK_DRAWDOWN_FIELD,indiparams:['']});t.officialRiskEnabled=enabled;t.officialIndicators=extraIndicators(t.payload,t.field);t.updatedAt=new Date().toISOString()});return {saved:true,enabled,field:BANK_DRAWDOWN_FIELD,notice:enabled?'已启用官方函数提供的最大回撤字段；权限、单位和窗口需实查，不自动评分':'已停止请求附加回撤字段，可手动重新查询净值；未自动重试，也未消耗接口额度'}}
 async function storedDetail({code,start,end}){if(!CODE_PATTERN.test(code||''))throw new ConnectorError('产品代码无效');try{queryDates(start,end)}catch(e){throw new ConnectorError(e.message)}const data=await load();if(!config.IFIND_REFRESH_TOKEN&&!config.IFIND_ACCESS_TOKEN)throw new ConnectorError('请配置本机凭据以读取对应账户已入库的历史数据；不会发送网络请求',503);const p=db.product(code);const template=data.templates.find(t=>t.category===p?.category);if(!template)throw new ConnectorError('该产品类别模板未配置',409);const value=db.snapshot({account:account(),basis:basis(template),code,start,end});if(!value)throw new ConnectorError('当前账户及模板下尚无这一完整区间的入库报告，请先执行授权查询或批量同步',404);return value}
 async function databaseStatus(){await load();return {...db.stats(account()),scope:'目录为已导入范围；净值及历史分析按当前凭据指纹隔离。无实时查询、无全市场覆盖承诺。'}}
 async function syncPlan(input={}){try{queryDates(input.start,input.end)}catch(e){throw new ConnectorError(e.message)}const data=await load();const plan=db.plan(input,data.templates.map(t=>t.category));const planKey=digest({plan,input:{category:input.category||'all',risk:input.risk||'all',search:input.search||'',start:input.start,end:input.end},account:account(),bases:data.templates.map(basis)});return {...plan,planKey,start:input.start,end:input.end,configured:!!(config.IFIND_REFRESH_TOKEN||config.IFIND_ACCESS_TOKEN),notice:'每只产品一次授权查询；不自动补全缺失字段，不自动重试失败。关闭页面后停止推进，回来后可继续。'}}
 async function createSync(input){const plan=await syncPlan(input);if(!plan.configured)throw new ConnectorError('未配置同花顺凭据，不能创建收费查询任务',503);if(input.planKey!==plan.planKey)throw new ConnectorError('产品目录、模板或范围已改变，请重新预览同步数量',409);if(input.confirmed!==true)throw new ConnectorError('请先预览同步范围并确认本次接口额度使用');if(!plan.ready)throw new ConnectorError('没有可同步产品，请先导入目录并配置类别净值模板',409);const data=await load();const options={category:CATEGORIES[input.category]?input.category:'all',search:String(input.search||'').slice(0,150),risk:/^R[1-5]$/.test(input.risk||'')?input.risk:'all',start:input.start,end:input.end};return db.createJob(options,{account:account(),bases:Object.fromEntries(data.templates.map(t=>[t.category,basis(t)]))})}
 async function syncControl({id,action}){await load();let job=db.job(id,account());if(!job)throw new ConnectorError('同步任务不存在或不属于当前凭据',404);if(action==='resume'){if(job.counts.pending){db.setState(id,'running')}else db.setState(id,'completed')}else if(action==='pause')db.setState(id,'paused');else throw new ConnectorError('任务操作无效');return db.job(id,account())}
 async function syncStep({id}){const data=await load();let job=db.job(id,account());if(!job)throw new ConnectorError('同步任务不存在或不属于当前凭据',404);if(job.state!=='running')return job;if(syncing)throw new ConnectorError('已有同步请求正在处理，请稍后',409);if(clock()<nextSyncAt)throw new ConnectorError('请间隔至少1秒推进同步',429);const item=db.claimNext(id,account());if(item?.busy)throw new ConnectorError('同账户已有进行中的同步请求，请稍后',409);if(!item){const current=db.job(id,account());if(!current.counts.pending&&!current.counts.running)db.setState(id,'completed');return db.job(id,account())}const template=data.templates.find(t=>t.category===item.category);if(!template||basis(template)!==job.options.bases[item.category]){db.itemState(id,item.seq,'pending');db.setState(id,'paused');throw new ConnectorError('净值模板已改变，本任务已暂停；请按新模板重新创建任务',409)}syncing=true;try{await detail({code:item.code,category:item.category,start:job.options.start,end:job.options.end});db.itemState(id,item.seq,'succeeded')}catch(error){db.itemState(id,item.seq,'failed',error instanceof ConnectorError?error.message:'本次查询或入库失败；未保存上游原始错误或凭据');db.setState(id,'paused')}finally{syncing=false;nextSyncAt=clock()+1000}job=db.job(id,account());if(!job.counts.pending&&!job.counts.running){db.setState(id,'completed');job=db.job(id,account())}return job}
 return {status,catalog,importCatalog,saveTemplate,detail,reference,confirmReference,searchReferences,storedDetail,databaseStatus,syncPlan,createSync,syncControl,syncStep,enableBankRisk,close:()=>db?.close()};
}
export const productService=createProductService();
