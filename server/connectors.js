import { EnvHttpProxyAgent, fetch as proxyFetch } from 'undici';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const IFIND_BASE='https://quantapi.51ifind.com/api/v1/';
export const QUERY_ENDPOINTS=new Set(['date_sequence','basic_data_service','cmd_history_quotation']);
const proxyDispatcher=new EnvHttpProxyAgent();
const DEFAULT_HOSTS=['www.chinawealth.com.cn','www.51ifind.com'];
export class ConnectorError extends Error {constructor(message,status=400){super(message);this.status=status}}
const secretPattern=/(password|passwd|token|secret|authorization|cookie)/i;
export function validateQuery(input){
 if(!input||!QUERY_ENDPOINTS.has(input.endpoint))throw new ConnectorError('仅支持白名单中的官方只读查询接口');
 if(!input.payload||typeof input.payload!=='object'||Array.isArray(input.payload))throw new ConnectorError('查询参数必须为 JSON 对象');
 const walk=(v)=>{if(v&&typeof v==='object')for(const [key,value] of Object.entries(v)){if(secretPattern.test(key))throw new ConnectorError('查询参数中不能包含密码、Token 或 Cookie；凭据仅由服务端配置');walk(value)}};walk(input.payload);
 if(JSON.stringify(input.payload).length>100000)throw new ConnectorError('查询参数过大');
 return input;
}
function privateIP(ip){return isIP(ip)===6?!/^2[0-9a-f]{3}:/i.test(ip):/^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|192\.0\.|192\.0\.2\.|198\.(1[89]|51)\.|203\.0\.113\.|22[4-9]\.|2[3-5]\d\.)/.test(ip)}
export async function validatePublicURL(value,{hosts=DEFAULT_HOSTS,resolve=lookup,allowProxyDNS=false}={}){
 let url;try{url=new URL(value)}catch{throw new ConnectorError('请输入完整的 HTTPS 公告地址')}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||isIP(url.hostname)||!hosts.includes(url.hostname.toLowerCase()))throw new ConnectorError('仅允许已配置的官方 HTTPS 域名，不接受 IP、端口、凭据或跳转地址');
 if([...url.searchParams.keys()].some(k=>secretPattern.test(k)))throw new ConnectorError('公告链接不能携带认证凭据');
 let ips;try{ips=await resolve(url.hostname,{all:true})}catch{if(allowProxyDNS&&DEFAULT_HOSTS.includes(url.hostname))return url;throw new ConnectorError('官方域名解析失败',502)}
 if(!ips.length||ips.some(a=>privateIP(a.address)))throw new ConnectorError('拒绝访问内部网络地址');return url;
}
async function readLimited(response,max){let bytes=0;const chunks=[];for await(const chunk of response.body){bytes+=chunk.length;if(bytes>max){await response.body.cancel().catch(()=>{});throw new ConnectorError('上游文件超过大小限制',413)}chunks.push(chunk)}return Buffer.concat(chunks).toString('utf8')}
async function officialFetch(url,options={}){
 try{return await proxyFetch(url,{...options,dispatcher:proxyDispatcher,redirect:'error',signal:AbortSignal.timeout(20000)})}catch{throw new ConnectorError('官方站点连接失败：请检查网络许可、代理和接口可用性',502)}
}
export function ifindFailure(data,{stage='query',httpStatus=null}={}){
 const code=data?.errorcode,providerCode=(typeof code==='number'&&Number.isFinite(code))||typeof code==='string'&&/^-?\d{1,12}$/.test(code)?String(code):null;
 // Classify provider text locally; never echo raw errmsg, tokens, account identifiers or response bodies.
 const text=String(data?.errmsg||data?.message||'').toLowerCase();
 const category=httpStatus===429||/额度|流量|用量|频率|频繁|quota|limit|exceed/.test(text)?'quota':stage==='authorization'||[401,403].includes(httpStatus)||/token|session|credential|令牌|登录|认证|授权|权限|permission|privilege|unauthori/.test(text)?'authorization':/参数|指标|字段|代码|日期|parameter|indicator|argument/.test(text)?'parameters':'query';
 const label=category==='authorization'?'同花顺授权或数据权限未通过':category==='quota'?'同花顺接口额度或请求频率受限':category==='parameters'?'同花顺未接受产品、指标或日期参数':'同花顺查询未被接受';
 const message=label+(providerCode?'（官方错误码 '+providerCode+'）':httpStatus?'（HTTP '+httpStatus+'）':'')+'；未自动重试。';
 const error=new ConnectorError(message,502);error.providerFailure={category,providerCode,httpStatus,stage};return error;
}
export async function queryIFind(input,{fetcher=officialFetch,config=process.env}={}){
 validateQuery(input);let token=config.IFIND_ACCESS_TOKEN;
 if(!token&&config.IFIND_REFRESH_TOKEN){const response=await fetcher(IFIND_BASE+'get_access_token',{method:'POST',headers:{'Content-Type':'application/json',refresh_token:config.IFIND_REFRESH_TOKEN},body:'{}'});if(!response.ok)throw ifindFailure(null,{stage:'authorization',httpStatus:response.status});let body;try{body=await response.json()}catch{throw new ConnectorError('iFinD Token 响应格式异常',502)}token=body?.data?.access_token;if(Number(body.errorcode)!==0||typeof token!=='string'||!token)throw ifindFailure(body,{stage:'authorization'})}
 if(!token)throw new ConnectorError('未配置 iFinD HTTP API Token。可先在客户端导出 CSV；网页登录账号密码不能代替接口授权',503);
 const url=IFIND_BASE+input.endpoint;
 const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json',access_token:token},body:JSON.stringify(input.payload)});
 if(!response.ok)throw ifindFailure(null,{httpStatus:response.status});
 const text=await readLimited(response,4_000_000);let data;try{data=JSON.parse(text)}catch{throw new ConnectorError('iFinD 未返回有效 JSON',502)}
 if(Number(data.errorcode)!==0)throw ifindFailure(data);
 return {data,source:{provider:'同花顺 iFinD HTTP API',url,title:`iFinD ${input.endpoint} 查询结果`,retrievedAt:new Date().toISOString()},verification:'API 返回成功；指标含义与授权展示范围仍需核对'};
}
const lastRead=new Map();
// 只读取用户指定的单篇官方原文；不登录、不绕验证码、不发现或递归抓取站点。
export async function readDisclosure(value,{fetcher=officialFetch,config=process.env,resolve=lookup}={}){
 const hosts=[...DEFAULT_HOSTS,...(config.PUBLIC_SOURCE_HOSTS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)];
 const url=await validatePublicURL(value,{hosts,resolve,allowProxyDNS:!!(config.HTTPS_PROXY||config.https_proxy||config.HTTP_PROXY||config.http_proxy)});
 if(Date.now()-(lastRead.get(url.hostname)||0)<2500)throw new ConnectorError('请稍候再读取同一站点，避免高频访问',429);
 lastRead.set(url.hostname,Date.now());
 // robots 无法确认时停止，不把登录页/拒绝响应当作披露。
 const robots=await fetcher(url.origin+'/robots.txt',{headers:{'User-Agent':'ZhihengResearch/1.0'}});
 if(robots.status!==404){if(!robots.ok)throw new ConnectorError('无法确认站点抓取规则，暂不读取该公告',502);const text=await readLimited(robots,100000);if(!robotsAllowed(text,url.pathname+url.search))throw new ConnectorError('站点 robots 规则不允许读取该路径',403)}
 const response=await fetcher(url.href,{headers:{'User-Agent':'ZhihengResearch/1.0','Accept':'text/html,text/plain'}});
 if(!response.ok)throw new ConnectorError(`原文站点返回 HTTP ${response.status}`,502);
 const contentType=response.headers.get('content-type')||'';
 if(!/text\/(html|plain)/i.test(contentType))throw new ConnectorError('目前仅读取 HTML/纯文本原文；PDF 请在官方入口下载并人工核对',415);
 const html=await readLimited(response,2_000_000);
 const title=(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'公开原文').replace(/<[^>]+>/g,'').trim().slice(0,300);
 const text=html.replace(/<(script|style|nav|footer)[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
 return {source:{provider:url.hostname,url:url.href,title,retrievedAt:new Date().toISOString()},text:text.slice(0,30000),status:'retrieved-unverified',notice:'仅取得原文文本，未自动确认产品匹配、数字口径或文件真实性；需人工对照。'};
}
export function robotsAllowed(text,path){
 // 保守解析：命中 * 或本程序分组的任一 Disallow 即停止；避免复杂规则误放行。
 const groups=[];let agents=[],rules=[],hasRules=false;
 for(const raw of text.split(/\r?\n/)){const line=raw.split('#')[0].trim();const colon=line.indexOf(':');if(colon<0)continue;const key=line.slice(0,colon).toLowerCase(),value=line.slice(colon+1).trim();if(key==='user-agent'){if(hasRules){groups.push({agents,rules});agents=[];rules=[];hasRules=false}agents.push(value.toLowerCase())}else if(key==='disallow'||key==='allow'){hasRules=true;rules.push({key,value})}}
 groups.push({agents,rules});
 for(const group of groups){if(!group.agents.some(a=>a==='*'||'zhihengresearch'.includes(a)))continue;for(const rule of group.rules){if(rule.key!=='disallow'||!rule.value)continue;const anchored=rule.value.endsWith('$');const pattern=(anchored?rule.value.slice(0,-1):rule.value).replace(/[.+?^${}()|[\]\\]/g,'\\$&').replaceAll('*','.*');if(new RegExp('^'+pattern+(anchored?'$':'')).test(path))return false}}
 return true;
}
