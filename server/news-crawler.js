import {lookup} from 'node:dns/promises';
import {EnvHttpProxyAgent,fetch as proxyFetch} from 'undici';
import {validatePublicURL,robotsAllowed,ConnectorError} from './connectors.js';
import {plainText,parseNewsRSS,parseEastmoneyNews,newsRelevance} from '../lib/news-evidence.js';
const dispatcher=new EnvHttpProxyAgent();
const hostLastRead=new Map();
const ARTICLE_HOSTS=['finance.eastmoney.com','fund.eastmoney.com','finance.sina.com.cn','www.cs.com.cn','www.stcn.com','www.cnstock.com','www.jjckb.cn','www.chinaamc.com','www.efunds.com.cn','www.jsfund.cn','www.gffunds.com.cn','www.nffund.com'];
export async function boundedText(response,max=2_000_000){const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>max)throw new ConnectorError('远程内容超过大小限制',502);chunks.push(chunk)}const bytesBuffer=Buffer.concat(chunks);const charset=(response.headers.get('content-type')?.match(/charset=["']?([a-z0-9_-]+)/i)?.[1]||bytesBuffer.subarray(0,2000).toString('ascii').match(/charset\s*=\s*["']?([a-z0-9_-]+)/i)?.[1]||'utf-8').toLowerCase();return new TextDecoder(['gbk','gb2312','gb18030'].includes(charset)?'gb18030':charset==='utf-16le'?'utf-16le':'utf-8').decode(bytesBuffer)}
export async function researchFetch(url,options={}){return proxyFetch(url,{...options,dispatcher,redirect:'error',signal:options.signal||AbortSignal.timeout(10000)})}
function sourceFailure(error,phase,httpStatus){
 const timeout=/timeout/i.test(error?.name||'')||/TIMEOUT|TIMEDOUT/.test(error?.cause?.code||'');
 return {reason:httpStatus?'http':phase==='parse'?'format':timeout?'timeout':'network',...(httpStatus?{httpStatus}:{}),message:httpStatus===403?'新闻源拒绝自动访问':httpStatus===429?'新闻源暂时限制请求频率':httpStatus?'新闻源返回错误响应':phase==='parse'?'新闻源返回格式发生变化':timeout?'连接新闻源超时':'未能连接新闻源'};
}
export function createNewsCrawler({config=process.env,fetcher=researchFetch,resolve=lookup,clock=()=>Date.now()}={}){
 const robotsCache=new Map(),hostQueues=new Map();
 const hosts=[...new Set([...ARTICLE_HOSTS,...(config.PUBLIC_SOURCE_HOSTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean),...(config.NEWS_SOURCE_HOSTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)])];
 async function article(url){
  const parsed=new URL(url);if(!hosts.includes(parsed.hostname))return {contentLevel:'feed_excerpt',readStatus:'摘要',text:null};
  const current=hostQueues.get(parsed.hostname)||Promise.resolve();
  const task=current.catch(()=>{}).then(async()=>{
   const safe=await validatePublicURL(url,{hosts,resolve});
   const gap=(hostLastRead.get(safe.hostname)||0)+1200-Date.now();if(gap>0)await new Promise(r=>setTimeout(r,gap));hostLastRead.set(safe.hostname,Date.now());
   let robots=robotsCache.get(safe.origin);if(!robots||robots.expires<clock()){
    const r=await fetcher(safe.origin+'/robots.txt',{headers:{'User-Agent':'ZhihengResearch/1.0'}});
    if(r.status===404)robots={text:'',expires:clock()+3600000};else {if(!r.ok)throw Error('robots unavailable');robots={text:await boundedText(r,100000),expires:clock()+3600000}}robotsCache.set(safe.origin,robots);
   }
   if(!robotsAllowed(robots.text,safe.pathname+safe.search))return {contentLevel:'feed_excerpt',readStatus:'原站不允许自动读取，展示摘要',text:null};
   const r=await fetcher(safe.href,{headers:{'User-Agent':'ZhihengResearch/1.0','Accept':'text/html,text/plain'}});if(!r.ok)throw Error('article unavailable');
   const type=r.headers.get('content-type')||'';if(!/text\/(html|plain)/i.test(type))return {contentLevel:'feed_excerpt',readStatus:'仅展示摘要',text:null};
   let html=await boundedText(r);if(/验证码|captcha-container|b_captcha|请完成验证|登录后(?:阅读|查看)|会员专享|付费阅读全文|页面不存在|404 Not Found|Access Denied/i.test(html))return {contentLevel:'feed_excerpt',readStatus:'原站需要验证，展示摘要',text:null};
   html=html.replace(/<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
   const blocks=(html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi)||[]).map(plainText).filter(x=>x.length>=25);const text=(blocks.length?blocks.join(' '):plainText(html)).slice(0,8000);
   return text.length>=80?{contentLevel:'article_text',readStatus:'已读取公开正文',text}:{contentLevel:'feed_excerpt',readStatus:'正文不足，展示摘要',text:null};
  });hostQueues.set(parsed.hostname,task);try{return await task}catch{return {contentLevel:'feed_excerpt',readStatus:'正文读取未完成，展示摘要',text:null}}finally{if(hostQueues.get(parsed.hostname)===task)hostQueues.delete(parsed.hostname)}
 }
 async function search(identity,{days=90}={}){
  const kind=({fund:'基金',bank:'理财',broker:'资管',trust:'信托'})[identity.category]||'基金';const terms=[`"${identity.name}" ${kind}`,...(identity.issuer?[`"${identity.issuer}" ${kind}`]:[])];const attempts=[],all=[];
  // RSS is a published subscription endpoint. Article HTML uses a separate, bounded robots-aware reader.
  await Promise.all(terms.map(async term=>{const url='https://www.bing.com/news/search?q='+encodeURIComponent(term)+'&format=rss&setlang=zh-Hans&cc=cn';let phase='connect',httpStatus;try{const r=await fetcher(url,{headers:{'User-Agent':'ZhihengResearch/1.0','Accept':'application/rss+xml,application/xml,text/xml'}});if(!r.ok){httpStatus=r.status;throw Error('feed unavailable')}phase='parse';const rows=parseNewsRSS(await boundedText(r,1000000),{now:clock(),days});all.push(...rows);attempts.push({provider:'Bing News RSS',status:'completed'})}catch(error){attempts.push({provider:'Bing News RSS',status:'unavailable',...sourceFailure(error,phase,httpStatus)})}}));
  if(!all.some(r=>newsRelevance(r,identity)==='product')){
   // Public website news-search JSONP, parsed as JSON only; never evaluate returned JavaScript.
   await Promise.all([identity.name,...(identity.issuer?[identity.issuer]:[])].map(async keyword=>{
    const params={uid:'',keyword,type:['cmsArticleWebOld'],client:'web',clientType:'web',clientVersion:'curr',param:{cmsArticleWebOld:{searchScope:'default',sort:'default',pageIndex:1,pageSize:10,preTag:'',postTag:''}}};
    const url='https://search-api-web.eastmoney.com/search/jsonp?cb=zhihengResearch&param='+encodeURIComponent(JSON.stringify(params));
    let phase='connect',httpStatus;try{const r=await fetcher(url,{headers:{'User-Agent':'ZhihengResearch/1.0','Accept':'application/json,application/javascript'}});if(!r.ok){httpStatus=r.status;throw Error('news unavailable')}phase='parse';all.push(...parseEastmoneyNews(await boundedText(r,1000000),{now:clock(),days}));attempts.push({provider:'东方财富公开新闻检索',status:'completed'})}catch(error){attempts.push({provider:'东方财富公开新闻检索',status:'unavailable',...sourceFailure(error,phase,httpStatus)})}
   }));
  }
  const unique=[...new Map(all.map(r=>[r.url,r])).values()].map(r=>({...r,scope:newsRelevance(r,identity)})).filter(r=>r.scope).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,8);
  const items=await Promise.all(unique.map(async(r,i)=>({...r,id:'N'+(i+1),...(i<4?await article(r.url):{contentLevel:'feed_excerpt',readStatus:'摘要',text:null})})));
  return {items,attempts,searchedAt:new Date(clock()).toISOString(),days,status:items.length?'ready':attempts.some(x=>x.status==='completed')?'empty':'unavailable',scope:'有限公开新闻检索；管理机构新闻不等同于该基金发生同一事件。'};
 }
 return {search,readArticle:article};
}
