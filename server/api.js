import {classifiedService} from './classified-service.js';
import {publicLibrary} from './public-library.js';
import {indicatorService} from './indicator-service.js';
import { productService } from './product-service.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { queryIFind,readDisclosure,ConnectorError } from './connectors.js';
const envFile=fileURLToPath(new URL('../.env',import.meta.url));
if(existsSync(envFile))process.loadEnvFile(envFile);
function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data))}
async function body(req){let content='';for await(const chunk of req){content+=chunk;if(Buffer.byteLength(content)>2_000_000)throw new ConnectorError('请求过大',413)}try{return JSON.parse(content)}catch{throw new ConnectorError('请求必须是有效 JSON')}}
export function createApiMiddleware(service=productService,indicators=indicatorService,publicData=publicLibrary,classified=classifiedService,authorize=null){return async function apiMiddleware(req,res,next){
 if(!req.url?.startsWith('/api/'))return next();
 try{
  if(authorize)await authorize(req);
  else {
  const address=req.socket.remoteAddress;
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address))throw new ConnectorError('数据接口只允许本机访问',403);
  const host=new URL('http://'+req.headers.host).hostname;
  if(!['localhost','127.0.0.1','[::1]'].includes(host))throw new ConnectorError('真实数据连接器仅供本机单用户使用',403);
  }
  const origin=req.headers.origin;
  if(origin&&new URL(origin).host!==req.headers.host)throw new ConnectorError('不允许跨站请求',403);
  if(req.method==='GET'&&req.url.startsWith('/api/analysis/latest?'))return json(res,200,classified.latest(new URL(req.url,'http://localhost').searchParams.get('code')));
  if(req.method==='GET'&&req.url==='/api/analysis/history')return json(res,200,classified.history());
  if(req.method==='GET'&&req.url.startsWith('/api/analysis/report?'))return json(res,200,classified.get(new URL(req.url,'http://localhost').searchParams.get('id')));
  if(req.method==='GET'&&req.url.startsWith('/api/public-library?'))return json(res,200,publicData.catalog(Object.fromEntries(new URL(req.url,'http://localhost').searchParams)));
  if(req.method==='GET'&&req.url==='/api/public-library')return json(res,200,publicData.catalog());
  if(req.method==='GET'&&req.url.startsWith('/api/public-library/detail?'))return json(res,200,publicData.detail(new URL(req.url,'http://localhost').searchParams.get('code')));
  if(req.method==='GET'&&req.url.startsWith('/api/products/reference?')){const code=new URL(req.url,'http://localhost').searchParams.get('code');return json(res,200,await service.reference(code))}
  if(req.method==='GET'&&req.url.startsWith('/api/products?')){const params=Object.fromEntries(new URL(req.url,'http://localhost').searchParams);return json(res,200,await service.catalog(params))}
  if(req.method==='GET'&&req.url==='/api/products')return json(res,200,await service.catalog());
  if(req.method==='GET'&&req.url==='/api/connection')return json(res,200,await service.status());
  if(req.method==='GET'&&req.url==='/api/indicators/plan')return json(res,200,indicators.status());
  if(req.method==='GET'&&req.url==='/api/indicators/history')return json(res,200,indicators.history());
  if(req.method==='GET'&&req.url==='/api/database')return json(res,200,await service.databaseStatus());
  if(req.method==='GET'&&req.url==='/api/status')return json(res,200,{mode:'local-single-user',ifind:{configured:!!(process.env.IFIND_ACCESS_TOKEN||process.env.IFIND_REFRESH_TOKEN),permissionVerified:false,connectionVerified:false,auth:'官方 HTTP API Token；不接收客户端账号密码',notice:'配置存在不代表授权有效；需执行一次成功查询。接口结构待用官方生成器及实际授权响应核验。'},publicSources:{hosts:['www.chinawealth.com.cn','www.51ifind.com',...(process.env.PUBLIC_SOURCE_HOSTS||'').split(',').filter(Boolean)],mode:'单篇原文读取，遵守 robots；不递归爬取'},credentialsExposed:false});
  if(req.method!=='POST')throw new ConnectorError('接口不存在或请求方法不支持',404);
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new ConnectorError('只接受 application/json',415);
  const input=await body(req);
  if(req.url==='/api/analysis/start')return json(res,200,await classified.start(input));
  if(req.url==='/api/analysis/step')return json(res,200,await classified.step(input));
  if(req.url==='/api/analysis/import-workbook')return json(res,200,await classified.importWorkbook(input));
  if(req.url==='/api/analysis/decision-profile')return json(res,200,classified.setDecisionProfile(input));
  if(req.url==='/api/analysis/units')return json(res,200,classified.setUnits(input));
  if(req.url==='/api/analysis/control')return json(res,200,classified.control(input));
  if(req.url==='/api/indicators/probe')return json(res,200,await indicators.probe(input));
  if(req.url==='/api/templates/bank-risk')return json(res,200,await service.enableBankRisk(input));
  if(req.url==='/api/database/snapshot')return json(res,200,await service.storedDetail(input));
  if(req.url==='/api/database/sync/plan')return json(res,200,await service.syncPlan(input));
  if(req.url==='/api/database/sync/create')return json(res,200,await service.createSync(input));
  if(req.url==='/api/database/sync/control')return json(res,200,await service.syncControl(input));
  if(req.url==='/api/database/sync/step')return json(res,200,await service.syncStep(input));
  if(req.url==='/api/products/import'){try{return json(res,200,await service.importCatalog(input.products))}catch(e){if(e instanceof ConnectorError)throw e;throw new ConnectorError(e.message)}}
  if(req.url==='/api/templates'){try{return json(res,200,await service.saveTemplate(input))}catch(e){if(e instanceof ConnectorError)throw e;throw new ConnectorError(e.message)}}
  if(req.url==='/api/products/references/search')return json(res,200,await service.searchReferences(input));
  if(req.url==='/api/products/references/confirm')return json(res,200,await service.confirmReference(input));
  if(req.url==='/api/products/query')return json(res,200,await service.detail(input));
  if(req.url==='/api/ifind/query')return json(res,200,await queryIFind(input));
  if(req.url==='/api/public/disclosure')return json(res,200,await readDisclosure(input.url));
  throw new ConnectorError('接口不存在',404);
 }catch(e){json(res,e instanceof ConnectorError?e.status:500,{error:e instanceof ConnectorError?e.message:'处理失败，请检查数据格式或服务配置（未记录凭据）'})}
}
}
export const apiMiddleware=createApiMiddleware();
