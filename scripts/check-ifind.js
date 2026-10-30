// One explicit, read-only NAV query. Never print credentials or raw provider responses.
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {EnvHttpProxyAgent,fetch as proxyFetch} from 'undici';
import {queryIFind} from '../server/connectors.js';
import {buildIndicatorQuery} from '../lib/indicator-plan.js';
import {parseOfficialIndicators} from '../lib/official-indicators.js';
const root=process.cwd();if(existsSync(resolve(root,'.env')))process.loadEnvFile(resolve(root,'.env'));
const directory=process.env.DATA_DIR||resolve(root,'.public-data');
const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--live')){console.error('仅支持可选参数 --live');process.exit(1)}
let db;
try{
 db=new DatabaseSync(resolve(directory,'finance.sqlite'),{readOnly:true});
 const row=db.prepare('SELECT data FROM analysis_runs ORDER BY updated_at DESC LIMIT 1').get();if(!row)throw Error('no report');
 const last=JSON.parse(row.data),plan=buildIndicatorQuery({code:last.code,category:last.category,start:last.start,end:last.end,fields:['ths_unit_nv_fund']});
 console.log(JSON.stringify({product:last.code,category:last.category,start:last.start,end:last.end,field:'ths_unit_nv_fund',lastState:last.state,accessConfigured:!!process.env.IFIND_ACCESS_TOKEN,refreshConfigured:!!process.env.IFIND_REFRESH_TOKEN,configured:!!(process.env.IFIND_ACCESS_TOKEN||process.env.IFIND_REFRESH_TOKEN)},null,2));
 if(!args.includes('--live')){console.log('以上仅检查配置与最近记录。加 --live 才执行一次官方单位净值查询，可能消耗接口额度。');process.exitCode=0}
 else{
  const dispatcher=new EnvHttpProxyAgent();
  const fetcher=async(url,options)=>{const response=await proxyFetch(url,{...options,dispatcher,redirect:'error',signal:AbortSignal.timeout(20000)});let body;try{body=await response.clone().json()}catch{}
   const code=body?.errorcode,text=String(body?.errmsg||body?.message||'').toLowerCase();const hint=Number(code)===0?'接口返回成功状态':response.status===429||/额度|流量|用量|频率|频繁|quota|limit|exceed/.test(text)?'官方用量或频率相关':/token|session|令牌|登录|授权|权限|permission|unauthori/.test(text)?'授权或数据权限相关':/参数|指标|字段|代码|日期|parameter|indicator/.test(text)?'产品、字段或日期参数相关':'需按官方错误码核查';console.log(JSON.stringify({stage:url.endsWith('get_access_token')?'authorization':'unit-nav',httpStatus:response.status,providerCode:typeof code==='number'||typeof code==='string'&&/^-?\d{1,12}$/.test(code)?code:null,hint}));return response};
  try{const result=await queryIFind(plan.query,{fetcher});const fields=parseOfficialIndicators(result.data,plan.definitions,last.code,result.source);console.log(JSON.stringify({accepted:true,validObservations:fields[0]?.series?.length||0,notice:'单字段成功不代表其他统计指标有权限或有数据；本次不改变评分。'},null,2))}
  catch(error){console.log(JSON.stringify({accepted:false,reason:error.providerFailure||null,message:error.providerFailure?error.message:'官方请求未完成；请检查网络或查看上方阶段与错误码。'},null,2));process.exitCode=2}
  finally{await dispatcher.close()}
 }
}catch{console.error('未找到当前网站的有效数据库或产品记录，请在正在使用的原项目根目录执行。');process.exitCode=1}
finally{db?.close()}
