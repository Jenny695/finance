import {validateDecisionProfile} from '../lib/investor-research.js';
import {fileURLToPath} from 'node:url';
import {queryIFind,ConnectorError} from './connectors.js';
import {openDatabase,digest} from './database.js';
import {productService} from './product-service.js';
import {CODE_PATTERN,CATEGORIES} from '../lib/catalog.js';
import {INVESTOR_INDICATORS} from '../lib/investor-indicators.js';
import {buildIndicatorQuery} from '../lib/indicator-plan.js';
import {INVESTOR_GROUPS,DEFAULT_INVESTOR_GROUPS,investorRows,investorBatches,isInvestorField} from '../lib/investor-indicators.js';
import {parseOfficialIndicators} from '../lib/official-indicators.js';
import {validateUnits} from '../lib/financial-rates.js';
import {validateSource} from '../lib/assessment.js';
import {emptyClassifiedRows,classifiedGroups,evaluateClassifiedReport} from '../lib/classified-assessment.js';
const folder=fileURLToPath(new URL('../.local/',import.meta.url));
export function createClassifiedService({query=queryIFind,config=process.env,directory=folder,context=(code,category)=>productService.analysisContext(code,category),clock=()=>Date.now()}={}){
 let db=null,busy=false,nextAt=0;
 const database=()=>db||=(openDatabase(directory));
 const account=()=>digest(config.IFIND_ACCESS_TOKEN||config.IFIND_REFRESH_TOKEN||'none');
 const configured=()=>!!(config.IFIND_REFRESH_TOKEN||config.IFIND_ACCESS_TOKEN);
 const stamp=()=>new Date(clock()).toISOString();
 function decorate(report){const results=investorRows(report.results);return {...report,results,groups:classifiedGroups(results),evaluation:evaluateClassifiedReport(results,report.context),progress:{completed:report.cursor,total:report.batches.length,queryCalls:report.queryCalls,valid:results.filter(r=>r.status==='returned-unverified'&&r.series.length).length,empty:results.filter(r=>r.status==='unavailable').length,failed:results.filter(r=>r.status==='request-failed').length}}}

 async function start(input){
  if(!input||Object.keys(input).some(k=>!['code','category','start','end','groups','confirmed','rateUnit','allocationUnit','performanceUnit'].includes(k)))throw new ConnectorError('仅接受产品、日期、分类和查询确认，不接受凭据或自定义接口');
  if(input.confirmed!==true)throw new ConnectorError('点击查询表示执行所选分类的分组授权请求，可能消耗额度');
  let units;try{units=validateUnits(input)}catch(e){throw new ConnectorError(e.message)}
  const groups=input.groups||DEFAULT_INVESTOR_GROUPS;if(!Array.isArray(groups)||!groups.length||new Set(groups).size!==groups.length||groups.some(g=>!INVESTOR_GROUPS[g]))throw new ConnectorError('请选择有效的不重复指标分类');
  const batches=investorBatches(groups);
  try{buildIndicatorQuery({code:input.code,category:input.category,start:input.start,end:input.end,fields:batches[0].fields,confirmed:true})}catch(e){throw new ConnectorError(e.message)}
  const previous=database().latestAnalysis(input.code,account());if(previous&&previous.origin!=='workbook'&&previous.category===input.category){units=validateUnits({...previous.context.units,...Object.fromEntries(['rateUnit','allocationUnit','performanceUnit'].filter(k=>k in input).map(k=>[k,input[k]]))})}const ctx={...await context(input.code,input.category),units,...(previous?.context?.decisionProfile?{decisionProfile:previous.context.decisionProfile}:{})};
  const report={code:input.code,category:ctx.product?.category||input.category,start:input.start,end:input.end,context:ctx,selectedGroups:groups,batches,results:emptyClassifiedRows(groups),cursor:0,queryCalls:0,consecutiveFailures:0,createdAt:stamp(),updatedAt:stamp(),state:configured()?'running':'blocked-credentials',notice:configured()?'空字段显示无有效数据，继续其他分类；缺失不计0分。':'本机未配置Token：已列出全部分类，未发送查询，不把未查询误报成无有效数据。'};
  return decorate(database().saveAnalysis(report,account()));
 }
 function get(id){const report=database().analysis(id,account());if(!report)throw new ConnectorError('报告不存在或不属于当前凭据',404);return decorate(report)}
 function control({id,action}){const report=database().analysis(id,account());if(!report)throw new ConnectorError('报告不存在或不属于当前凭据',404);if(!['pause','resume'].includes(action))throw new ConnectorError('操作无效');if(action==='resume'&&!configured())throw new ConnectorError('请先配置本机Token',503);const value={...report,state:action==='pause'?'paused':report.cursor>=report.batches.length?'completed':'running',consecutiveFailures:action==='resume'?0:report.consecutiveFailures,updatedAt:stamp()};return decorate(database().updateAnalysis(value,account()))}
 async function step({id}){
  if(busy)throw new ConnectorError('已有分类查询正在进行，请稍后',409);
  if(clock()<nextAt)throw new ConnectorError('请间隔至少1秒继续查询',429);
  const owner=account(),claim=database().claimAnalysis(id,owner);if(!claim)throw new ConnectorError('报告不存在或不属于当前凭据',404);if(claim.busy)throw new ConnectorError('该报告已有进行中请求',409);
  const report=claim.report;if(!claim.claimed)return decorate(report);
  const batch=report.batches[report.cursor];if(!batch)return decorate(database().updateAnalysis({...report,state:'completed',updatedAt:stamp()},owner,{release:true}));
  busy=true;let results=report.results,failure=false,queried=false;const fields=batch.fields.filter(isInvestorField);
  try{
   if(fields.length){const plan=buildIndicatorQuery({code:report.code,category:report.category,start:report.start,end:report.end,fields,confirmed:true});queried=true;const raw=await query(plan.query);
   if(!validateSource(raw?.source)||Number(raw?.data?.errorcode)!==0)throw Error('invalid source or response');
   const parsed=parseOfficialIndicators(raw.data,plan.definitions,report.code,raw.source).map(r=>({...r,score:null,scoreReason:'原始指标不按数值大小直接打分；可评分的派生指标及公式单独展示',outsideRequestedRange:r.series.filter(p=>p.date<report.start||p.date>report.end).length}));
   results=results.map(r=>parsed.find(p=>p.field===r.field)||r);}
  }catch{failure=true;results=results.map(r=>fields.includes(r.field)?{...r,status:'request-failed',notice:'本组请求未完成；不能据此断言字段无数据。未自动重试。',series:[]}:r)}
  finally{busy=false;nextAt=clock()+1000}
  const current=database().analysis(id,owner)||report;const cursor=report.cursor+1,consecutiveFailures=queried?(failure?report.consecutiveFailures+1:0):report.consecutiveFailures;
  let state=cursor>=report.batches.length?'completed':current.state;
  if(consecutiveFailures>=3&&state==='running')state='paused-error';
  const value={...report,results,cursor,queryCalls:report.queryCalls+(queried?1:0),consecutiveFailures,state,updatedAt:stamp(),notice:state==='paused-error'?'连续三组请求失败，已暂停以避免重复消耗；尚未查询项仍保留。':failure?'本组请求失败，已保留状态；其他分类继续。':!queried?'已跳过旧报告中移除的字段，本次未请求接口。':'空字段不计零分，有效净值用于多维评分。'};
  return decorate(database().updateAnalysis(value,owner,{release:true}));
 }
 async function importWorkbook(input){
  const allowed=['code','category','time','table','filename','fileHash','sourceColumnCount','rateUnit','allocationUnit','performanceUnit'];
  if(!input||Object.keys(input).some(k=>!allowed.includes(k))||typeof input.code!=='string'||!CODE_PATTERN.test(input.code||'')||!CATEGORIES[input.category])throw new ConnectorError('导入产品、类别或字段无效');
  if(!Array.isArray(input.time)||!input.time.length||input.time.length>2000||new Set(input.time).size!==input.time.length||input.time.some(d=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d))throw new ConnectorError('导入日期无效、重复或超过2000条');
  if(input.sourceColumnCount!==undefined&&(!Number.isSafeInteger(input.sourceColumnCount)||input.sourceColumnCount<1||input.sourceColumnCount>1000))throw new ConnectorError('原始列数无效');
  const fields=Object.keys(input.table||{});if(!fields.length||fields.some(f=>!isInvestorField(f)||!Array.isArray(input.table[f])||input.table[f].length!==input.time.length))throw new ConnectorError('导入指标列或长度无效');
  if(typeof input.filename!=='string'||input.filename.length>150||!/^[a-f0-9]{64}$/.test(input.fileHash||''))throw new ConnectorError('导入文件记录无效');
  let units;try{units=validateUnits(input)}catch(e){throw new ConnectorError(e.message)}
  const source={provider:'用户导入的同花顺终端结果（未重新联网核验）',url:'https://quantapi.51ifind.com/',title:input.filename+' · 本机导入数据',retrievedAt:stamp(),kind:'uploaded-workbook',filename:input.filename,fileHash:input.fileHash};
  const definitions=INVESTOR_INDICATORS.filter(d=>fields.includes(d.field)),parsed=parseOfficialIndicators({errorcode:0,tables:[{thscode:input.code,time:input.time,table:input.table}]},definitions,input.code,source),results=emptyClassifiedRows([]).map(d=>parsed.find(p=>p.field===d.field)||d);
  const ctx={...await context(input.code,input.category),units},dates=[...input.time].sort();
  const report={code:input.code,category:ctx.product?.category||input.category,start:dates[0],end:dates.at(-1),context:ctx,selectedGroups:[...new Set(definitions.map(d=>d.group))],batches:[],results,cursor:0,queryCalls:0,consecutiveFailures:0,createdAt:stamp(),updatedAt:stamp(),state:'completed',origin:'workbook',uploadedRows:input.time.length,sourceColumnCount:input.sourceColumnCount||fields.length,notice:'已导入本机结果表，本次未调用同花顺；保留原始值，未独立联网核验文件内容。'};
  return decorate(database().saveAnalysis(report,account()));
 }
 function setUnits(input){
  if(!input||Object.keys(input).some(k=>!['id','rateUnit','allocationUnit','performanceUnit'].includes(k)))throw new ConnectorError('仅接受报告与数值单位');
  const report=database().analysis(input.id,account());if(!report)throw new ConnectorError('报告不存在或不属于当前凭据',404);
  let units;try{units=validateUnits({...report.context.units,...input})}catch(e){throw new ConnectorError(e.message)}
  return decorate(database().updateAnalysis({...report,context:{...report.context,units},updatedAt:stamp(),notice:'已按确认的单位重新计算当前报告；本次没有请求同花顺。'},account()));
 }
 function setDecisionProfile(input){
  if(!input||Object.keys(input).some(k=>!['id','profile'].includes(k)))throw new ConnectorError('投资计划参数无效');
  const report=database().analysis(input.id,account());if(!report)throw new ConnectorError('报告不存在或不属于当前凭据',404);
  let profile;try{profile=validateDecisionProfile(input.profile)}catch(e){throw new ConnectorError(e.message)}
  return decorate(database().updateAnalysis({...report,context:{...report.context,decisionProfile:profile},updatedAt:stamp()},account()));
 }
 function latest(code){if(typeof code!=='string'||!code.length||code.length>40)throw new ConnectorError('产品代码无效');const r=database().latestAnalysis(code,account());if(!r)throw new ConnectorError('当前凭据下尚无该产品分类报告',404);return decorate(r)}
 return {start,get,control,step,setUnits,setDecisionProfile,importWorkbook,latest,history:()=>({reports:database().analyses(account()).map(decorate)}),close:()=>db?.close()};
}
export const classifiedService=createClassifiedService();
