import {fileURLToPath} from 'node:url';
import {queryIFind,ConnectorError} from './connectors.js';
import {openDatabase,digest} from './database.js';
import {indicatorPlan,buildIndicatorQuery} from '../lib/indicator-plan.js';
import {parseOfficialIndicators} from '../lib/official-indicators.js';
import {validateSource} from '../lib/assessment.js';
const folder=fileURLToPath(new URL('../.local/',import.meta.url));
export function createIndicatorService({query=queryIFind,config=process.env,directory=folder,clock=()=>Date.now()}={}){
 let db=null,busy=false,lastQueryAt=-Infinity;
 const configured=()=>!!(config.IFIND_REFRESH_TOKEN||config.IFIND_ACCESS_TOKEN);
 const account=()=>digest(config.IFIND_ACCESS_TOKEN||config.IFIND_REFRESH_TOKEN||'none');
 const database=()=>db||=(openDatabase(directory));
 const status=()=>({...indicatorPlan(),configured:configured(),permissionVerified:false,credentialNotice:'仅检查本机配置存在，不暴露或证明Token有效；未配置时不会向官方发送请求'});
 async function probe(input){
  let plan;try{plan=buildIndicatorQuery(input)}catch(e){throw new ConnectorError(e.message)}
  if(input.confirmed!==true)throw new ConnectorError('请确认本次1次授权查询可能消耗接口额度');
  if(busy)throw new ConnectorError('已有指标测试正在进行，请稍后',409);
  if(configured()&&clock()-lastQueryAt<1000)throw new ConnectorError('请间隔至少1秒测试，未发送新请求',429);
  const owner=account();const base={code:input.code,category:input.category,start:input.start,end:input.end,endpoint:plan.query.endpoint,request:plan.query.payload,warnings:plan.warnings,testedAt:new Date(clock()).toISOString(),state:'blocked-credentials',attempted:false,queryCalls:0,scoringReady:false,source:null,results:plan.definitions.map(d=>({...d,status:'not-tested',series:[],scoreEligible:false})),notice:'云端或本机尚未配置Token，本次没有执行授权请求，不能证明字段可用'};
  if(!configured())return database().saveProbe(base,owner);
  busy=true;lastQueryAt=clock();
  try{
   const raw=await query(plan.query);
   if(!validateSource(raw?.source)||Number(raw?.data?.errorcode)!==0)throw Error('invalid upstream result');
   const results=parseOfficialIndicators(raw.data,plan.definitions,input.code,raw.source).map(r=>({...r,scoreEligible:false,outsideRequestedRange:r.series.filter(p=>p.date<input.start||p.date>input.end).length,reportPeriod:null,publishedAt:null}));
   const report={...base,state:'query-returned',attempted:true,queryCalls:1,source:raw.source,results,summary:{returned:results.filter(r=>r.series.length).length,unavailable:results.filter(r=>r.status==='unavailable').length,invalid:results.filter(r=>['invalid-data','unsupported-shape'].includes(r.status)).length,total:results.length},notice:'官方请求返回成功不等于每项有数据或可评分；逐项检查日期、类型、单位、窗口、参数和产品适用性'};
   return database().saveProbe(report,owner);
  }catch(error){
   return database().saveProbe({...base,state:'query-failed',attempted:true,queryCalls:1,notice:'本次授权查询未完成；请检查网络、权限、额度与参数。未自动重试，不能据此断言字段不存在',failureStatus:error instanceof ConnectorError?error.status:null},owner);
  }finally{busy=false}
 }
 return {status,probe,history:()=>({reports:database().probes(account()),notice:'仅显示当前凭据指纹的最近10份测试记录；测试不自动修改产品评分或净值模板'}),close:()=>db?.close()};
}
export const indicatorService=createIndicatorService();
