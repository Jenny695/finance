import {fileURLToPath} from 'node:url';
import {queryIFind,ConnectorError} from './connectors.js';
import {openDatabase,digest} from './database.js';
import {productService} from './product-service.js';
import {indicatorPlan,buildIndicatorQuery} from '../lib/indicator-plan.js';
import {INDICATOR_GROUPS} from '../lib/indicator-catalog.js';
import {parseOfficialIndicators} from '../lib/official-indicators.js';
import {validateSource} from '../lib/assessment.js';
import {emptyClassifiedRows,classifiedGroups,evaluateClassifiedReport} from '../lib/classified-assessment.js';
const folder=fileURLToPath(new URL('../.local/',import.meta.url));
export function createClassifiedService({query=queryIFind,config=process.env,directory=folder,context=(code,category)=>productService.analysisContext(code,category),clock=()=>Date.now()}={}){
 let db=null,busy=false,nextAt=0;
 const database=()=>db||=(openDatabase(directory));
 const account=()=>digest(config.IFIND_ACCESS_TOKEN||config.IFIND_REFRESH_TOKEN||'none');
 const configured=()=>!!(config.IFIND_REFRESH_TOKEN||config.IFIND_ACCESS_TOKEN);
 const stamp=()=>new Date(clock()).toISOString();
 function decorate(report){return {...report,groups:classifiedGroups(report.results),evaluation:evaluateClassifiedReport(report.results,report.context),progress:{completed:report.cursor,total:report.batches.length,queryCalls:report.queryCalls,valid:report.results.filter(r=>r.status==='returned-unverified'&&r.series.length).length,empty:report.results.filter(r=>r.status==='unavailable').length,failed:report.results.filter(r=>r.status==='request-failed').length}}}
 async function start(input){
  if(!input||Object.keys(input).some(k=>!['code','category','start','end','groups','confirmed'].includes(k)))throw new ConnectorError('仅接受产品、日期、分类和查询确认，不接受凭据或自定义接口');
  if(input.confirmed!==true)throw new ConnectorError('点击查询表示执行所选分类的分组授权请求，可能消耗额度');
  const groups=input.groups||['core'];if(!Array.isArray(groups)||!groups.length||new Set(groups).size!==groups.length||groups.some(g=>!INDICATOR_GROUPS[g]))throw new ConnectorError('请选择有效的不重复指标分类');
  const batches=indicatorPlan().batches.filter(b=>b.id!=='starter'&&groups.includes(b.id.split('-')[0]));
  try{buildIndicatorQuery({code:input.code,category:input.category,start:input.start,end:input.end,fields:batches[0].fields,confirmed:true})}catch(e){throw new ConnectorError(e.message)}
  const ctx=await context(input.code,input.category);
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
  busy=true;let results=report.results,failure=false;
  try{
   const plan=buildIndicatorQuery({code:report.code,category:report.category,start:report.start,end:report.end,fields:batch.fields,confirmed:true});const raw=await query(plan.query);
   if(!validateSource(raw?.source)||Number(raw?.data?.errorcode)!==0)throw Error('invalid source or response');
   const parsed=parseOfficialIndicators(raw.data,plan.definitions,report.code,raw.source).map(r=>({...r,score:null,scoreReason:'原始指标不按数值大小直接打分；可评分的派生指标及公式单独展示',outsideRequestedRange:r.series.filter(p=>p.date<report.start||p.date>report.end).length}));
   results=results.map(r=>parsed.find(p=>p.field===r.field)||r);
  }catch{failure=true;results=results.map(r=>batch.fields.includes(r.field)?{...r,status:'request-failed',notice:'本组请求未完成；不能据此断言字段无数据。未自动重试。',series:[]}:r)}
  finally{busy=false;nextAt=clock()+1000}
  const current=database().analysis(id,owner)||report;const cursor=report.cursor+1,consecutiveFailures=failure?report.consecutiveFailures+1:0;
  let state=cursor>=report.batches.length?'completed':current.state;
  if(consecutiveFailures>=3&&state==='running')state='paused-error';
  const value={...report,results,cursor,queryCalls:report.queryCalls+1,consecutiveFailures,state,updatedAt:stamp(),notice:state==='paused-error'?'连续三组请求失败，已暂停以避免重复消耗；尚未查询项仍保留。':failure?'本组请求失败，已保留状态；其他分类继续。':'空字段直接标无有效数据，不影响其他字段和可计算的评分。'};
  return decorate(database().updateAnalysis(value,owner,{release:true}));
 }
 function latest(code){if(typeof code!=='string'||!code.length||code.length>40)throw new ConnectorError('产品代码无效');const r=database().latestAnalysis(code,account());if(!r)throw new ConnectorError('当前凭据下尚无该产品分类报告',404);return decorate(r)}
 return {start,get,control,step,latest,history:()=>({reports:database().analyses(account()).map(decorate)}),close:()=>db?.close()};
}
export const classifiedService=createClassifiedService();
