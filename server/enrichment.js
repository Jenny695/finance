import {readFile} from 'node:fs/promises';
import {EnvHttpProxyAgent,fetch as proxyFetch} from 'undici';
const dispatcher=new EnvHttpProxyAgent();
const snapshot=JSON.parse(await readFile(new URL('./references/jining-ttyl.json',import.meta.url),'utf8'));
const clean=s=>String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
const decode=s=>String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"');
export function referenceFor(code,{confirmed=false,now=new Date().toISOString().slice(0,10)}={}){
 if(code!==snapshot.ifindCode)return null;
 const value=structuredClone(snapshot);const disclosedTop10=Number(value.holdings.reduce((s,h)=>s+h.weight,0).toFixed(2));
 const totalValue=value.facts.reportedAssetValuationWan;const coveredValue=value.holdings.reduce((s,h)=>s+(h.valuationWan||0),0);const coverageByValue=totalValue>0?Math.round(coveredValue/totalValue*10000)/100:null;
 return {...value,identityConfirmed:confirmed,status:confirmed?'用户已确认编码映射':'同名同管理人官方资料，编码映射待确认',ageDays:Math.max(0,Math.floor((Date.parse(now)-Date.parse(value.asOf))/86400000)),derived:{disclosedTop10,coverageByValue,top1:value.holdings[0].weight,assetHHI:Number(value.allocations.reduce((s,a)=>s+(a.weight/100)**2,0).toFixed(6)),assetHHINote:'只衡量报告中资产大类集中度，不是发行人或信用风险集中度'},evidence:confirmed?{assets:{confirmed:true,source:value.source,allocations:value.allocations,lookthroughCoverage:coverageByValue,coverageBasis:'已披露明细估值合计/报告资产组合估值合计，不代表信用穿透；与占净资产比例求和分开'}}:{}};
}
// 官网报告按自身登记编码匹配，不替用户确认iFinD内部编码映射。
export function curatedPublicBundle(now=new Date().toISOString().slice(0,10)){
 const ref=referenceFor(snapshot.ifindCode,{confirmed:true,now});
 const candidateIFindCode=ref.ifindCode;delete ref.ifindCode;
 return {...ref,identityBasis:'官网报告登记编码与当前公开产品一致；未关联同花顺内部代码',status:'官网登记编码对应的历史披露',candidateIFindCode:{code:candidateIFindCode,confirmed:false,basis:snapshot.matchBasis}};
}
export function relevantResult(result,product){const text=clean(result.title+' '+result.snippet).replace(/\s/g,'');const registration=String(product.registrationCode||'');const core=String(product.name||'').replace(/（[^）]*）|\([^)]*\)/g,'').replace(product.issuer||'','').replace(/[·•\s]/g,'').replace(/理财产品|股份有限公司|银行/g,'');const issuer=String(product.issuer||'').replace(/股份有限公司/g,'');if(registration&&text.includes(registration))return true;return core.length>=3&&text.includes(core)&&issuer.length>=2&&text.includes(issuer)}
export function parseSearchHTML(html,engine='baidu'){
 if(/百度安全验证|请完成下方验证|验证码验证|captcha-container|b_captcha/i.test(html))throw Error('搜索站点要求验证，未绕过');
 const results=[];
 if(engine==='baidu')for(const chunk of html.split(/(?=<div[^>]+class="result c-container)/i)){
  const url=chunk.match(/\bmu="([^"]+)"/i)?.[1];const title=chunk.match(/<h3\b[\s\S]*?<\/h3>/i)?.[0];if(!url||!title)continue;let parsed;try{parsed=new URL(decode(url))}catch{continue}if(parsed.protocol!=='https:'||parsed.username||parsed.password)continue;results.push({url:parsed.href,title:clean(title),snippet:clean(chunk.slice(0,18000)).slice(0,1200),engine:'百度公开检索'});
 }else for(const chunk of html.match(/<li class="b_algo"[\s\S]*?<\/li>/g)||[]){const h=chunk.match(/<h2\b[\s\S]*?<\/h2>/)?.[0];if(!h)continue;let url=decode(h.match(/href="([^"]+)"/)?.[1]);try{const parsed=new URL(url);if(parsed.hostname==='www.bing.com'&&parsed.pathname==='/ck/a'){const u=parsed.searchParams.get('u');if(u?.startsWith('a1'))url=Buffer.from(u.slice(2),'base64url').toString('utf8')}const target=new URL(url);if(target.protocol==='https:'&&!target.username&&!target.password)results.push({url:target.href,title:clean(h),snippet:clean(chunk).slice(0,1200),engine:'Bing公开检索'})}catch{}}
 return [...new Map(results.map(r=>[r.url,r])).values()].slice(0,15);
}
async function fetchSearch(url){const response=await proxyFetch(url,{dispatcher,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'text/html'}});if(!response.ok)throw Error(`搜索服务返回HTTP ${response.status}`);const length=Number(response.headers.get('content-length')||0);if(length>2_000_000)throw Error('搜索页面过大');let bytes=0;const chunks=[];for await(const c of response.body){bytes+=c.length;if(bytes>2_000_000)throw Error('搜索页面过大');chunks.push(c)}return Buffer.concat(chunks).toString('utf8')}
const recent=new Map();
export async function searchPublicReferences(product,{fetcher=fetchSearch,now=Date.now()}={}){
 if(!product?.name||!product?.issuer)throw Error('请先提供可核对的产品名称与机构；只凭内部代码无法可靠匹配全网资料');
 const last=recent.get(product.code);if(last&&now-last.time<600000)return {...last.value,cached:true};
 const name=String(product.name).replace(/（[^）]*）|\([^)]*\)/g,'').slice(0,100);const query=`"${product.issuer}" "${name}" 理财 报告 收益 赎回`;
 const searches=[{engine:'baidu',url:'https://www.baidu.com/s?wd='+encodeURIComponent(query)},{engine:'bing',url:'https://www.bing.com/search?q='+encodeURIComponent(query)+'&setlang=zh-Hans&cc=cn'}];const attempts=[],all=[];
 for(const search of searches){try{const html=await fetcher(search.url);const results=parseSearchHTML(html,search.engine);const matched=results.filter(r=>relevantResult(r,product));all.push(...matched);attempts.push({engine:search.engine,url:search.url,status:matched.length?'找到相关候选':'返回页面但未匹配该产品',received:results.length,matched:matched.length});if(matched.length>=3)break}catch(error){attempts.push({engine:search.engine,url:search.url,status:'检索未完成',reason:/验证|HTTP|过大/.test(error.message)?error.message:'网络或搜索服务不可用'})}}
 const value={query,attempts,candidates:[...new Map(all.map(r=>[r.url,{...r,verified:false,note:'搜索候选，尚未核对原文、报告期与登记编码；不计入评分'}])).values()],searchedAt:new Date(now).toISOString(),cached:false,scope:'两家公开搜索引擎的有限检索，不保证全网覆盖；不绕验证，不把摘要当证据'};recent.set(product.code,{time:now,value});if(recent.size>100)recent.delete(recent.keys().next().value);return value;
}
