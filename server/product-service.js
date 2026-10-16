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
 let state=null;let stateRevision=0;let updates=Promise.resolve();const cache=new Map(),pending=new Map();
 async function load(){if(state)return state;try{state=JSON.parse(await readFile(folder+'/catalog.json','utf8'));if(!Array.isArray(state.products)||!Array.isArray(state.templates))throw Error()}catch(e){if(e.code!=='ENOENT')throw new ConnectorError('本机产品配置无法读取，请检查.local/catalog.json，未自动覆盖',500);state={products:defaults?structuredClone(initialCatalog):[],templates:defaults?[structuredClone(bankTemplate)]:[]}}return state}
 async function change(fn){const task=updates.then(async()=>{const current=await load();const next=structuredClone(current);fn(next);await mkdir(folder,{recursive:true});await writeFile(folder+'/catalog.tmp',JSON.stringify(next,null,2),'utf8');await rename(folder+'/catalog.tmp',folder+'/catalog.json');state=next;stateRevision++;cache.clear();return next});updates=task.catch(()=>{});return task}
 async function status(){const data=await load();return {configured:!!(config.IFIND_REFRESH_TOKEN||config.IFIND_ACCESS_TOKEN),products:data.products.length,templates:data.templates.map(({category,field,updatedAt,verification})=>({category,field,updatedAt,verification})),supports:Object.keys(CATEGORIES),scope:'仅本机配置的产品目录，非同花顺全市场产品库'} }
 async function catalog({search='',category='all',risk='all',page=1}={}){const data=await load();const text=String(search).slice(0,150).toLowerCase();let products=data.products.filter(p=>(category==='all'||p.category===category)&&(risk==='all'||p.riskLevel===risk)&&[p.code,p.name,p.issuer].some(v=>v.toLowerCase().includes(text)));const total=products.length;page=Math.max(1,Math.min(Math.ceil(total/12)||1,Number(page)||1));return {items:products.slice((page-1)*12,page*12).map(p=>({...p,queryReady:data.templates.some(t=>t.category===p.category)})),total,page,pageSize:12,mode:'live-catalog',scope:'本机已导入的产品目录；目录信息待核验，非全市场覆盖'} }
 async function importCatalog(products){const valid=catalogRows(products);await change(data=>{const existing=new Map(data.products.map(p=>[p.code,p]));valid.forEach(p=>existing.set(p.code,p));data.products=[...existing.values()]});return {imported:valid.length,...await status()}}
 async function saveTemplate(input){const template=validateTemplate(input);await change(data=>{data.templates=data.templates.filter(t=>t.category!==template.category);data.templates.push(template)});return {category:template.category,field:template.field,saved:true}}
 async function detail({code,category,start,end,refresh=false}){
  if(!CODE_PATTERN.test(code||''))throw new ConnectorError('请输入有效产品代码');
  const data=await load();const known=data.products.find(p=>p.code===code);const selectedCategory=known?.category||category;
  const template=data.templates.find(t=>t.category===selectedCategory);if(!template)throw new ConnectorError('该类别尚未配置真实净值指标。请在“数据连接”导入官方查询模板后再查询；不会猜测字段或用股票价格替代',409);
  let input;try{input=templateQuery(template,code,start,end)}catch(e){throw new ConnectorError(e.message)}
  const identity=createHash('sha256').update(config.IFIND_ACCESS_TOKEN||config.IFIND_REFRESH_TOKEN||'none').digest('hex');
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
   const value={product:base,diagnostics,readiness,reference,evidence,series,metrics,assessment,source,navBasis:template.navBasis,distributions:template.distributions,field:template.field,missingObservations:series.missingCount||0,mode:'live',cached:false,queriedAt:new Date(clock()).toISOString(),scoringReason,notice:'本次iFinD授权查询成功；登记信息、披露资料与指标含义仍需核对。没有原文证据的非净值维度不评分。',requestRange:{start,end}};
   cache.set(key,{time:clock(),value});if(cache.size>100)cache.delete(cache.keys().next().value);return value;
  })();pending.set(key,task);try{return await task}finally{pending.delete(key)}
 }
 async function reference(code){if(!CODE_PATTERN.test(code||''))throw new ConnectorError('产品代码无效');const data=await load();return {reference:referenceFor(code,{confirmed:!!data.referenceMatches?.[code]}),notice:'历史官网资料与当前净值区间分开呈现，搜索摘要不计入评分'}}
 async function confirmReference({code,registrationCode,confirmed}){const ref=referenceFor(code);if(!ref||registrationCode!==ref.registrationCode||confirmed!==true)throw new ConnectorError('请对照官网报告确认产品名称、管理人和登记编码，再确认映射');await change(data=>{data.referenceMatches||={};data.referenceMatches[code]={registrationCode,confirmedAt:new Date().toISOString(),basis:'用户对照原文确认映射'}});return reference(code)}
 async function searchReferences({code}){const data=await load();const p=data.products.find(p=>p.code===code);if(!p)throw new ConnectorError('先导入产品名称和机构，才能可靠匹配公开资料');return searchPublicReferences(p)}
 return {status,catalog,importCatalog,saveTemplate,detail,reference,confirmReference,searchReferences};
}
export const productService=createProductService();
