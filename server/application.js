import {AsyncLocalStorage} from 'node:async_hooks';
import {isIP} from 'node:net';
import {createAuth,AuthError} from './auth.js';
import {createProductService} from './product-service.js';
import {createClassifiedService} from './classified-service.js';
import {createPublicLibrary} from './public-library.js';
import {createApiMiddleware} from './api.js';
import {queryIFind,ConnectorError} from './connectors.js';
const memberGet=new Set(['/api/products','/api/connection','/api/analysis/latest','/api/analysis/history','/api/analysis/report','/api/public-library','/api/public-library/detail','/api/products/reference']);
const memberPost=new Set(['/api/analysis/start','/api/analysis/step','/api/analysis/control','/api/analysis/decision-profile']);
function json(res,status,value){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(value))}
async function body(req){if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new AuthError('请求格式错误',415);let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>16000)throw new AuthError('请求过大',413)}try{return JSON.parse(text)}catch{throw new AuthError('请求格式错误')}}
export function createApplication({directory,config=process.env,query=queryIFind,origin=null,clock=()=>Date.now()}={}){
 const scope=new AsyncLocalStorage();const auth=createAuth({directory,clock,secure:origin?.startsWith('https:'),maxDailyQueries:Number(config.USER_DAILY_QUERY_LIMIT)||36,maxTotalDailyQueries:Number(config.TOTAL_DAILY_QUERY_LIMIT)||240});
 const products=createProductService({folder:directory,config,defaults:false,hideOther:true,clock});
 const library=createPublicLibrary({folder:directory,clock});
 const classified=createClassifiedService({directory,config,clock,owner:()=>scope.getStore()?.user.id,context:(code,category)=>products.analysisContext(code,category),defaultUnits:{rateUnit:config.IFIND_RATE_UNIT||'auto',allocationUnit:config.IFIND_ALLOCATION_UNIT||'auto',performanceUnit:config.IFIND_PERFORMANCE_UNIT||'auto'},query:async plan=>{const user=scope.getStore()?.user;if(!user)throw new ConnectorError('请先登录',401);try{auth.consume(user.id)}catch(error){throw new ConnectorError(error.message,error.status)}return query(plan)}});
 function expectedOrigin(req){if(origin)return new URL(origin).origin;const host=new URL('http://'+req.headers.host);if(!['localhost','127.0.0.1','[::1]'].includes(host.hostname))throw new AuthError('访问地址无效',403);return host.origin}
 function validateRequest(req){const target=expectedOrigin(req);if(req.headers.host!==new URL(target).host)throw new AuthError('访问地址无效',403);if(req.headers['sec-fetch-site']==='cross-site')throw new AuthError('不允许跨站请求',403);if(req.method==='POST'&&req.headers.origin!==target)throw new AuthError('请从本站提交请求',403);if(req.headers.origin&&req.headers.origin!==target)throw new AuthError('不允许跨站请求',403)}
 function ip(req){if(config.TRUST_PROXY==='1'){const forwarded=String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim();if(isIP(forwarded))return forwarded}return req.socket.remoteAddress||'unknown'}
 const api=createApiMiddleware(products,undefined,library,classified,req=>{const user=scope.getStore()?.user;if(!user)throw new ConnectorError('请先登录',401);const path=new URL(req.url,'http://internal').pathname;if(user.role!=='admin'&&!((req.method==='GET'&&memberGet.has(path))||(req.method==='POST'&&memberPost.has(path))))throw new ConnectorError('此功能仅供管理员使用',403);try{auth.rateLimit('api:'+user.id,150,60000);if(req.method==='POST'&&path==='/api/analysis/start'){auth.rateLimit('analysis-start:'+user.id,user.role==='admin'?100:20,3600000);if(!config.IFIND_REFRESH_TOKEN&&!config.IFIND_ACCESS_TOKEN)throw new ConnectorError('市场数据服务暂未开放，请稍后查询',503)}}catch(error){throw new ConnectorError(error.message,error.status)}});
 let stepQueue=Promise.resolve(),queued=0,nextStepAt=0;
 async function enqueueStep(req,user,res,next){if(queued>=64)throw new AuthError('当前查询较多，请稍后重试',429);queued++;const task=stepQueue.then(async()=>{const delay=nextStepAt-clock();if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));if(req.destroyed)return;try{return await scope.run({user},()=>api(req,res,next))}finally{nextStepAt=clock()+1100}});stepQueue=task.catch(()=>{});try{return await task}finally{queued--}}
 const ready=auth.bootstrap(config.ADMIN_USERNAME,config.ADMIN_PASSWORD);
 async function handle(req,res,next){if(!req.url?.startsWith('/api/'))return next();try{await ready;validateRequest(req);const path=new URL(req.url,'http://internal').pathname;
  if(path==='/api/auth/session'&&req.method==='GET'){const user=auth.user(req);return json(res,200,{user,mode:'investor',dataAvailable:!!(config.IFIND_ACCESS_TOKEN||config.IFIND_REFRESH_TOKEN),usage:user?auth.usage(user.id):null})}
  if(['/api/auth/register','/api/auth/login'].includes(path)&&req.method==='POST'){const input=await body(req),user=path.endsWith('/register')?await auth.register(input,ip(req)):await auth.login(input,ip(req));const session=auth.issue(user);res.setHeader('Set-Cookie',session.cookie);return json(res,200,{user})}
  if(path==='/api/auth/logout'&&req.method==='POST'){await body(req);res.setHeader('Set-Cookie',auth.logout(req));return json(res,200,{ok:true})}
  const user=auth.user(req);if(!user)return json(res,401,{error:'请先登录'});
  if(path==='/api/analysis/step'&&req.method==='POST')return await enqueueStep(req,user,res,next);
  return await scope.run({user},()=>api(req,res,next));
 }catch(error){json(res,error.status||500,{error:error instanceof AuthError||error instanceof ConnectorError?error.message:'服务暂不可用，请稍后重试'})}}
 return {handle,ready,products,classified,auth,close(){classified.close();products.close();library.close();auth.close()}};
}
