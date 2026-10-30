// News and model responses are untrusted text. This module never executes HTML or model instructions.
export function researchText(value){const text=String(value??'').trim();return !text||/待核对|待确认/.test(text)||/^(未知|未披露|暂无|无资料|--|—|N\/A|null)$/i.test(text)?'':text}
export const QUALITATIVE_DIMENSIONS={strategy:'投资策略与风格',management:'管理与治理',disclosure:'信息披露',events:'事件与舆情'};
export const SIGNALS={favorable:'有利线索',watch:'关注风险',mixed:'正反因素并存',insufficient:'资料不足'};
export function decodeText(value){return String(value??'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(?:#(x[\da-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi,(m,n)=>{if(n){const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>0&&code<=0x10ffff?String.fromCodePoint(code):''}return ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[m.toLowerCase()]||m})}
export const plainText=value=>decodeText(String(value??'').replace(/<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
export function newsLink(value,depth=0){if(depth>3)return null;try{const u=new URL(decodeText(value));if(u.hostname==='www.bing.com'&&/\/news\//.test(u.pathname)&&u.searchParams.get('url'))return newsLink(u.searchParams.get('url'),depth+1);if(u.protocol==='http:'&&['finance.eastmoney.com','fund.eastmoney.com'].includes(u.hostname))u.protocol='https:';if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname==='localhost'||/\.(localhost|local|internal)$/.test(u.hostname)||/^[\d.:\[\]]+$/.test(u.hostname)||!u.hostname.includes('.'))return null;u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(k))u.searchParams.delete(k);return u.href}catch{return null}}
const tag=(item,name)=>item.match(new RegExp('<'+name+'\\b[^>]*>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]||'';
export function parseNewsRSS(xml,{now=Date.now(),days=90}={}){
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('订阅源格式不受支持');
 if(!/<(?:rss|feed)\b/i.test(xml))throw Error('新闻订阅源未返回RSS');
 const rows=[];for(const item of (xml.match(/<item\b[\s\S]*?<\/item>/gi)||[]).slice(0,40)){
  const url=newsLink(tag(item,'link')),title=plainText(decodeText(tag(item,'title'))).slice(0,300),excerpt=plainText(decodeText(tag(item,'description'))).slice(0,1800),date=Date.parse(plainText(tag(item,'pubDate')));
  // Missing publication time is not silently treated as a recent article.
  if(!url||!title||!Number.isFinite(date)||date>now+3600000||date<now-days*86400000)continue;
  const provider=plainText(tag(item,'source')).slice(0,100)||new URL(url).hostname;
  rows.push({url,title,excerpt,provider,publishedAt:new Date(date).toISOString()});
 }
 return [...new Map(rows.map(r=>[r.url,r])).values()];
}
export function parseEastmoneyNews(value,{now=Date.now(),days=90}={}){
 const text=String(value).trim(),json=text.startsWith('{')?text:text.match(/^zhihengResearch\s*\(([\s\S]*)\)\s*;?$/)?.[1];
 if(!json)throw Error('公开新闻源格式不受支持');
 const data=JSON.parse(json),rows=data?.result?.cmsArticleWebOld;if(!Array.isArray(rows))throw Error('公开新闻源未返回列表');
 return [...new Map(rows.slice(0,40).map(row=>{const rawDate=String(row.date||'').trim();const normalized=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(rawDate)?rawDate.replace(' ','T')+'+08:00':rawDate;const time=Date.parse(normalized),url=newsLink(row.url),title=plainText(row.title).slice(0,300);if(!url||!title||!Number.isFinite(time)||time>now+3600000||time<now-days*86400000)return null;return {url,title,excerpt:plainText(row.content).slice(0,1800),provider:plainText(row.mediaName).slice(0,100)||new URL(url).hostname,publishedAt:new Date(time).toISOString()}}).filter(Boolean).map(r=>[r.url,r])).values()];
}
export function parseTavilyNews(data,{now=Date.now(),days=90}={}){
 if(!Array.isArray(data?.results))throw Error('新闻搜索API未返回结果列表');
 const values=data.results.slice(0,20).map(row=>{const url=newsLink(row.url),title=plainText(row.title).slice(0,300),time=Date.parse(row.published_date||'');if(!url||!title||!Number.isFinite(time)||time>now+3600000||time<now-days*86400000)return null;const raw=plainText(row.raw_content).slice(0,8000);return {url,title,excerpt:plainText(row.content).slice(0,1800),provider:new URL(url).hostname,publishedAt:new Date(time).toISOString(),origin:'search-api',...(raw.length>=80?{text:raw,contentLevel:'article_text',readStatus:'搜索服务提供的原文'}:{text:null,contentLevel:'feed_excerpt',readStatus:'搜索服务摘要'})}}).filter(Boolean);
 return [...new Map(values.map(r=>[r.url,r])).values()];
}
const compact=s=>plainText(s).replace(/[\s·•（）()《》“”"']/g,'').toLowerCase();
export function newsRelevance(article,identity){
 const text=compact(article.title+' '+article.excerpt+' '+(article.text||'')),name=compact(identity.name),issuer=compact(identity.issuer);
 if(name.length>=3&&text.includes(name))return 'product';
 const family=name.replace(/[a-z]$/,'');if(family.length>=5&&text.includes(family))return 'product';
 if(issuer.length>=4&&text.includes(issuer))return 'issuer';
 return null;
}
export function quantitativeEvidence(report){
 if(!report?.evaluation||!report.progress?.valid)return null;
 const v=report.evaluation;const text=JSON.stringify({产品代码:report.code,观察区间:[report.start,report.end],有效指标:report.progress.valid,综合参考分:v.summary?.score,覆盖率:v.summary?.coverage,维度:(v.assessment?.dimensions||[]).filter(d=>Number.isFinite(d.score)).map(d=>({名称:d.name,分数:d.score,口径:d.scope})),实际净值区间:v.metrics?[v.metrics.startDate,v.metrics.endDate]:null,区间净值变化:v.metrics?.periodReturn,年化波动:v.metrics?.volatility});
 // No username, holdings, risk budget, investment amount or decision profile leaves the server.
 return {id:'Q1',title:'本次量化分析摘要',text,level:'quantitative',scope:'product',url:null};
}
export function aiEvidence(news,quant){return [...news.items.slice(0,8).map(n=>({id:n.id,title:n.title,text:plainText(n.title+' '+(n.text||n.excerpt)).slice(0,4200),level:n.contentLevel,scope:n.scope,publishedAt:n.publishedAt,dateSource:n.dateSource||'source',origin:n.origin||'automatic',url:n.url})),...(quant?[quant]:[])]}
export function validateAIReport(value,evidence){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('AI返回结构不完整');
 const byId=new Map(evidence.map(e=>[e.id,e]));
 function claim(input,required=true){
  if(!input||typeof input.text!=='string'||!input.text.trim()||input.text.length>1000)throw Error('AI论据缺少说明');
  if(!Array.isArray(input.citations)||input.citations.length>6||required&&!input.citations.length)throw Error('AI结论缺少原文引用');
  const citations=input.citations.map(c=>{const source=byId.get(c?.id),quote=plainText(c?.quote);if(!source||quote.length<4||quote.length>240||!plainText(source.text).includes(quote))throw Error('AI引用未能对应原文');return {id:source.id,quote}});
  const scope=citations.every(c=>c.id==='Q1')?'quantitative':citations.some(c=>c.id!=='Q1'&&byId.get(c.id).scope==='product')?'product':'issuer';return {text:input.text.trim(),citations,scope};
 }
 if(!Array.isArray(value.dimensions)||value.dimensions.length!==4||new Set(value.dimensions.map(d=>d.id)).size!==4)throw Error('AI维度不完整');
 const dimensions=value.dimensions.map(d=>{if(!Object.hasOwn(QUALITATIVE_DIMENSIONS,d.id)||!Object.hasOwn(SIGNALS,d.signal))throw Error('AI维度无效');if(d.signal==='insufficient')return {id:d.id,name:QUALITATIVE_DIMENSIONS[d.id],signal:'insufficient',text:'现有资料不足以评价这一维度。',citations:[]};const c=claim(d);if(c.citations.every(x=>x.id==='Q1'))throw Error('定性维度需要新闻或原文证据');if(['strategy','disclosure'].includes(d.id)&&c.scope!=='product')return {id:d.id,name:QUALITATIVE_DIMENSIONS[d.id],signal:'insufficient',text:'缺少该产品直接相关的资料。',citations:[]};return {id:d.id,name:QUALITATIVE_DIMENSIONS[d.id],signal:d.signal,...c}});
 const list=key=>{if(!Array.isArray(value[key])||value[key].length>6)throw Error('AI条目结构无效');return value[key].map(x=>claim(x))};
 return {overview:claim(value.overview),dimensions,positives:list('positives'),risks:list('risks'),checkpoints:['核对基金最新定期报告与投资范围。','结合持有期限、退出规则和自己的风险承受能力复核。']};
}
