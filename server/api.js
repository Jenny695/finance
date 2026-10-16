import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { queryIFind,readDisclosure,ConnectorError } from './connectors.js';
const envFile=fileURLToPath(new URL('../.env',import.meta.url));
if(existsSync(envFile))process.loadEnvFile(envFile);
function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data))}
async function body(req){let content='';for await(const chunk of req){content+=chunk;if(Buffer.byteLength(content)>150000)throw new ConnectorError('请求过大',413)}try{return JSON.parse(content)}catch{throw new ConnectorError('请求必须是有效 JSON')}}
export async function apiMiddleware(req,res,next){
 if(!req.url?.startsWith('/api/'))return next();
 try{
  const host=new URL('http://'+req.headers.host).hostname;
  if(!['localhost','127.0.0.1','[::1]'].includes(host))throw new ConnectorError('真实数据连接器仅供本机单用户使用',403);
  const origin=req.headers.origin;
  if(origin&&new URL(origin).host!==req.headers.host)throw new ConnectorError('不允许跨站请求',403);
  if(req.method==='GET'&&req.url==='/api/status')return json(res,200,{mode:'local-single-user',ifind:{configured:!!(process.env.IFIND_ACCESS_TOKEN||process.env.IFIND_REFRESH_TOKEN),permissionVerified:false,connectionVerified:false,auth:'官方 HTTP API Token；不接收客户端账号密码',notice:'配置存在不代表授权有效；需执行一次成功查询。接口结构待用官方生成器及实际授权响应核验。'},publicSources:{hosts:['www.chinawealth.com.cn','www.51ifind.com',...(process.env.PUBLIC_SOURCE_HOSTS||'').split(',').filter(Boolean)],mode:'单篇原文读取，遵守 robots；不递归爬取'},credentialsExposed:false});
  if(req.method!=='POST')throw new ConnectorError('接口不存在或请求方法不支持',404);
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new ConnectorError('只接受 application/json',415);
  const input=await body(req);
  if(req.url==='/api/ifind/query')return json(res,200,await queryIFind(input));
  if(req.url==='/api/public/disclosure')return json(res,200,await readDisclosure(input.url));
  throw new ConnectorError('接口不存在',404);
 }catch(e){json(res,e instanceof ConnectorError?e.status:500,{error:e instanceof ConnectorError?e.message:'处理失败，请检查数据格式或服务配置（未记录凭据）'})}
}
