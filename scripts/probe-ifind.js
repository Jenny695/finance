import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createIndicatorService} from '../server/indicator-service.js';
import {indicatorPlan,buildIndicatorQuery} from '../lib/indicator-plan.js';
const root=fileURLToPath(new URL('../',import.meta.url));if(existsSync(root+'.env'))process.loadEnvFile(root+'.env');
const args=process.argv.slice(2),allowed=new Set(['--live','--code','--category','--start','--end','--batch']);
function option(name,fallback){const i=args.indexOf(name);return i<0?fallback:args[i+1]}
try{
 for(let i=0;i<args.length;i++){if(!allowed.has(args[i]))throw Error('未知命令选项');if(args[i]!=='--live'){if(!args[i+1]||args[i+1].startsWith('--'))throw Error('选项缺少参数');i++}}
 const date=new Date();date.setUTCDate(date.getUTCDate()-1);const end=date.toISOString().slice(0,10);date.setUTCDate(date.getUTCDate()-30);const start=date.toISOString().slice(0,10);
 const plan=indicatorPlan(),batch=plan.batches.find(b=>b.id===option('--batch','starter'));if(!batch)throw Error('测试组不存在，请在网页指标方案中查看');
 const input={code:option('--code','YH0000434.YH'),category:option('--category','bank'),start:option('--start',start),end:option('--end',end),fields:batch.fields,confirmed:true};
 const prepared=buildIndicatorQuery(input);
 if(!args.includes('--live'))console.log(JSON.stringify({state:'plan-only',attempted:false,fieldCount:plan.fieldCount,batch:batch.label,request:prepared.query,warnings:prepared.warnings,notice:'未发请求。--live才执行本组1次授权查询，可能消耗额度；Token只从本机.env或环境读取'},null,2));
 else{const service=createIndicatorService();try{const report=await service.probe(input);await mkdir(root+'.local',{recursive:true});await writeFile(root+'.local/ifind-probe-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({state:report.state,attempted:report.attempted,queryCalls:report.queryCalls,summary:report.summary||null,notice:report.notice,saved:'.local/ifind-probe-report.json'},null,2));if(report.state!=='query-returned')process.exitCode=2;else if(report.results.some(r=>r.status!=='returned-unverified'))process.exitCode=3}finally{service.close()}}
}catch{console.error('测试未完成：请核对选项、产品、日期与本机配置。未输出上游错误或凭据。');process.exitCode=1}
