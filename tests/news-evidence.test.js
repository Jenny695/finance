import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNewsRSS,parseEastmoneyNews,parseTavilyNews,newsRelevance,newsLink,quantitativeEvidence,validateAIReport,aiEvidence} from '../lib/news-evidence.js';
import {createNewsCrawler} from '../server/news-crawler.js';
const now=Date.parse('2026-10-30T03:00:00Z');
const identity={code:'000001.OF',name:'测试成长混合A',issuer:'测试基金管理有限公司'};
const rss=(url='https://finance.eastmoney.com/a/1.html',date='Thu, 29 Oct 2026 00:00:00 GMT')=>`<rss><channel><item><title><![CDATA[测试成长混合A 发布季度报告]]></title><link>${url.replaceAll('&','&amp;')}</link><description><![CDATA[<p>报告介绍了测试成长混合A的投资策略与风险。</p>]]></description><pubDate>${date}</pubDate><source>测试媒体</source></item></channel></rss>`;
test('新闻RSS解析真实来源、日期和重定向包装；过滤过期未来无日期、无效链接与外部实体',()=>{
 const data=parseNewsRSS(rss(),{now,days:30});assert.equal(data.length,1);assert.equal(data[0].provider,'测试媒体');assert.ok(!data[0].excerpt.includes('<p>'));
 const wrapper='https://www.bing.com/news/apiclick.aspx?url='+encodeURIComponent('https://finance.eastmoney.com/a/1.html');assert.equal(parseNewsRSS(rss(wrapper),{now})[0].url,data[0].url);
 assert.equal(parseNewsRSS(rss(undefined,'Thu, 01 Jan 2026 00:00:00 GMT'),{now}).length,0);
 assert.equal(parseNewsRSS(rss(undefined,'Thu, 29 Oct 2027 00:00:00 GMT'),{now}).length,0);
 assert.equal(parseNewsRSS(rss(undefined,''),{now}).length,0);
 for(const u of ['javascript:alert(1)','https://127.0.0.1/a','https://u:p@evil.example/a'])assert.equal(newsLink(u),null);
 assert.throws(()=>parseNewsRSS('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+rss(),{now}));
});
test('产品报道和管理机构报道分别匹配，无关新闻不混入；量化摘要不发送个人计划与仓位',()=>{
 assert.equal(newsRelevance({title:'测试成长混合A发布报告'},identity),'product');assert.equal(newsRelevance({title:'测试基金管理有限公司发布公司公告'},identity),'issuer');assert.equal(newsRelevance({title:'另一只产品的新闻'},identity),null);
 const q=quantitativeEvidence({code:identity.code,start:'2026-01-01',end:'2026-10-29',progress:{valid:1},context:{decisionProfile:{investmentAmount:999999,positionPercent:80}},evaluation:{summary:{score:70,coverage:90},assessment:{dimensions:[]}}});assert.ok(!q.text.includes('999999'));assert.ok(!q.text.includes('decisionProfile'));
});
test('原文抓取遵守robots；不允许域名、内网地址和重定向响应不当成已读正文',async()=>{
 let calls=[];
 const crawler=createNewsCrawler({clock:()=>now,resolve:async()=>[{address:'93.184.216.34'}],fetcher:async url=>{calls.push(url);if(url.includes('news/search'))return new Response(rss(),{headers:{'content-type':'application/rss+xml'}});return new Response('User-agent: *\nDisallow: /a/')}});
 const result=await crawler.search(identity);assert.equal(result.items.length,1);assert.equal(result.items[0].contentLevel,'feed_excerpt');assert.equal(calls.length,3);
 calls=[];const privateCrawler=createNewsCrawler({clock:()=>now,resolve:async()=>[{address:'10.0.0.1'}],fetcher:async url=>{calls.push(url);return new Response(rss())}});const blocked=await privateCrawler.search(identity);assert.equal(blocked.items[0].contentLevel,'feed_excerpt');assert.equal(calls.length,2);
});
test('允许读取的公开正文提取来源片段，搜索失败不伪造报道',async()=>{
 const text='测试成长混合A的季度报告详细说明了本期资产配置、基金风险和投资策略，报告同时说明过往表现不能代表未来表现。';
 const crawler=createNewsCrawler({clock:()=>now,resolve:async()=>[{address:'93.184.216.34'}],fetcher:async url=>url.includes('news/search')?new Response(rss()):url.endsWith('/robots.txt')?new Response('',{status:404}):new Response('<p>'+text.repeat(3)+'</p>',{headers:{'content-type':'text/html'}})});
 const r=await crawler.search(identity);assert.equal(r.items[0].contentLevel,'article_text');assert.ok(r.items[0].text.includes(text));
 const failed=createNewsCrawler({clock:()=>now,fetcher:async()=>{throw Error('private diagnostic')}});const empty=await failed.search(identity);assert.equal(empty.status,'unavailable');assert.deepEqual(empty.items,[]);assert.ok(!JSON.stringify(empty).includes('private diagnostic'));
});
const news={items:[{id:'N1',title:'测试基金发布报告',text:'测试基金发布季度报告，说明本期投资策略与风险。',scope:'product',contentLevel:'article_text',url:'https://example.com/a'}]};
function answer(){const c={text:'报告介绍了策略。',citations:[{id:'N1',quote:'说明本期投资策略与风险'}]};return {overview:c,dimensions:['strategy','management','disclosure','events'].map(id=>({id,signal:id==='strategy'?'favorable':'insufficient',...c})),positives:[c],risks:[]}}
test('AI论据要求真实证据编号和逐字引文；拒绝伪造引用，资料不足不虚构评分',()=>{
 const ev=aiEvidence(news,null),result=validateAIReport(answer(),ev);assert.equal(result.dimensions.length,4);assert.equal(result.dimensions[1].text,'现有资料不足以评价这一维度。');assert.ok(!('score' in result.dimensions[0]));
 for(const bad of [{id:'FAKE',quote:'说明本期投资策略与风险'},{id:'N1',quote:'并不存在的收益承诺'}]){const value=answer();value.overview.citations=[bad];assert.throws(()=>validateAIReport(value,ev))}
 const value=answer();value.overview.citations=[];assert.throws(()=>validateAIReport(value,ev));
});

test('东方财富公开JSONP仅解析JSON，明确中国本地发布时间，不执行回调脚本',()=>{
 const value='zhihengResearch('+JSON.stringify({result:{cmsArticleWebOld:[{title:'<em>测试成长混合A</em>季度报告',content:'报告内容',date:'2026-10-29 10:00:00',mediaName:'测试媒体',url:'http://finance.eastmoney.com/a/1.html'}]}})+');';
 const rows=parseEastmoneyNews(value,{now});assert.equal(rows[0].publishedAt,'2026-10-29T02:00:00.000Z');assert.equal(rows[0].url,'https://finance.eastmoney.com/a/1.html');assert.equal(rows[0].title,'测试成长混合A 季度报告');assert.throws(()=>parseEastmoneyNews('evilCallback('+JSON.stringify({})+');alert(1)',{now}));
});
test('只有管理机构新闻时，不把机构报道当作基金策略和披露质量的直接证据',()=>{
 const issuerNews={items:[{id:'N1',title:'测试机构公告',text:'测试机构公告说明本期投资策略与风险。',scope:'issuer',contentLevel:'article_text',url:'https://example.com/a'}]};
 const r=validateAIReport(answer(),aiEvidence(issuerNews,null));assert.equal(r.dimensions.find(d=>d.id==='strategy').signal,'insufficient');assert.equal(r.overview.scope,'issuer');
});
test('RSS不可用时补充公开新闻JSONP检索；结果去重且仍遵守正文读取规则',async()=>{
 const json='zhihengResearch('+JSON.stringify({result:{cmsArticleWebOld:[{title:'测试成长混合A公布季度报告',content:'测试成长混合A投资策略',date:'2026-10-29 10:00:00',mediaName:'测试媒体',url:'https://finance.eastmoney.com/a/fallback.html'}]}})+');';
 const crawler=createNewsCrawler({clock:()=>now,resolve:async()=>[{address:'93.184.216.34'}],fetcher:async url=>url.includes('news/search')?new Response('',{status:503}):url.includes('search/jsonp')?new Response(json):new Response('User-agent: *\nDisallow: /')});
 const r=await crawler.search(identity);assert.equal(r.status,'ready');assert.equal(r.items.length,1);assert.equal(r.items[0].contentLevel,'feed_excerpt');assert.ok(r.attempts.some(a=>a.provider==='东方财富公开新闻检索'&&a.status==='completed'));
});
test('失败新闻源保留安全的HTTP和格式诊断，不暴露原始异常或凭据',async()=>{
 const crawler=createNewsCrawler({clock:()=>now,fetcher:async url=>url.includes('bing.com')?new Response('secret',{status:403}):new Response('changed JSONP with PRIVATE_TEST_KEY')});
 const r=await crawler.search(identity);assert.equal(r.status,'unavailable');assert.ok(r.attempts.some(a=>a.httpStatus===403));assert.ok(r.attempts.some(a=>a.reason==='format'));assert.ok(!JSON.stringify(r).includes('PRIVATE_TEST_KEY'));
});

test('正式搜索API仅使用有发布时间的来源，不把搜索服务答案当新闻，密钥只用于请求头',async()=>{
 const secret='SYNTHETIC_SEARCH_KEY_NOT_REAL';let calls=[];
 const response={answer:'不应被作为新闻',results:[{title:'测试成长混合A季度报告',url:'https://finance.eastmoney.com/a/api.html',content:'测试成长混合A披露了报告内容。',raw_content:'测试成长混合A的季度报告披露了投资策略与资产配置情况。'.repeat(5),published_date:'2026-10-29T02:00:00Z'},{title:'无日期新闻',url:'https://example.com/missing',content:'测试成长混合A'},{title:'未来新闻',url:'https://example.com/future',published_date:'2027-01-01'}]};
 const crawler=createNewsCrawler({clock:()=>now,config:{NEWS_SEARCH_PROVIDER:'tavily',NEWS_SEARCH_API_KEY:secret},fetcher:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(response))}});
 const r=await crawler.search(identity);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.tavily.com/search');assert.equal(calls[0].options.headers.Authorization,'Bearer '+secret);assert.ok(!calls[0].options.body.includes(secret));assert.equal(JSON.parse(calls[0].options.body).topic,'news');assert.equal(r.status,'ready');assert.equal(r.items.length,1);assert.equal(r.items[0].contentLevel,'article_text');assert.equal(r.items[0].readStatus,'搜索服务提供的原文');assert.ok(!JSON.stringify(r).includes(secret));assert.ok(!JSON.stringify(r).includes(response.answer));
});
test('正式搜索API未配置、授权失败或额度不足时明确提示，不转发密钥或偷偷回退抓网页',async()=>{
 let calls=0;const missing=createNewsCrawler({config:{NEWS_SEARCH_PROVIDER:'tavily'},fetcher:async()=>{calls++;throw Error('unexpected')}});const r=await missing.search(identity);assert.equal(calls,0);assert.equal(r.attempts[0].reason,'configuration');
 for(const status of [401,403,429]){const crawler=createNewsCrawler({config:{NEWS_SEARCH_API_KEY:'SYNTHETIC_PRIVATE'},fetcher:async()=>{calls++;return new Response('SYNTHETIC_PRIVATE',{status})}});const result=await crawler.search(identity);assert.equal(result.status,'unavailable');assert.equal(result.attempts.length,1);assert.equal(result.attempts[0].httpStatus,status);assert.equal(result.attempts[0].reason,status===429?'quota':'authorization');assert.ok(!JSON.stringify(result).includes('SYNTHETIC_PRIVATE'))}
});

test('新闻库只返回无关行业报道时补充基金网页，未注明日期的资料不冒充近期新闻',async()=>{
 const calls=[];
 const fund={code:'000003.OF',category:'fund',name:'中海可转债债券A',issuer:''};
 const crawler=createNewsCrawler({clock:()=>now,config:{NEWS_SEARCH_API_KEY:'SYNTHETIC'},fetcher:async(url,options)=>{
  const q=JSON.parse(options.body);calls.push(q);
  return new Response(JSON.stringify({results:q.topic==='news'?[{title:'财富周刊：黄金突破，首批10只科创债基金获批',content:'中海基金等公司获批。',published_date:'2026-10-29',url:'https://example.com/unrelated'}]:[{title:'中海可转债债券型证券投资基金季度报告',content:'中海可转债债券基金投资范围与风险说明。',url:'https://example.com/fund-report'}]}));
 }});
 const value=await crawler.search(fund);
 assert.equal(calls.length,2);assert.equal(calls[1].topic,'general');assert.ok(calls[1].query.includes('中海可转债债券'));assert.equal(value.items.length,1);assert.equal(value.items[0].url,'https://example.com/fund-report');assert.equal(value.items[0].publishedAt,null);assert.equal(value.items[0].recency,'unverified');assert.equal(value.attempts[0].matchedResults,0);assert.equal(value.attempts[1].matchedResults,1);
 const evidence=aiEvidence(value,null);assert.equal(evidence[0].recency,'unverified');assert.equal(evidence[0].dateSource,'未提供日期');
});

test('网页补充不接受已过期、未来、错误日期或无关产品，不将网页检索答案作为证据',()=>{
 const rows=[{title:'基金网页',url:'https://example.com/a'},...['2020-01-01','2028-01-01','bad-date'].map((published_date,i)=>({title:'基金网页',url:'https://example.com/'+i,published_date}))];
 assert.equal(parseTavilyNews({results:rows},{now}).length,0);
 const parsed=parseTavilyNews({answer:'model generated answer',results:rows},{now,allowUndated:true});assert.equal(parsed.length,1);assert.equal(parsed[0].publishedAt,null);assert.ok(!JSON.stringify(parsed).includes('model generated answer'));
});

test('补充网页查询失败仍保留第一次新闻查询诊断，不暴露密钥',async()=>{
 let calls=0;const crawler=createNewsCrawler({clock:()=>now,config:{NEWS_SEARCH_API_KEY:'SYNTHETIC_PRIVATE'},fetcher:async()=>++calls===1?new Response(JSON.stringify({results:[]})):new Response('SYNTHETIC_PRIVATE',{status:429})});
 const result=await crawler.search(identity);assert.equal(result.attempts.length,2);assert.equal(result.attempts[0].status,'completed');assert.equal(result.attempts[1].httpStatus,429);assert.ok(!JSON.stringify(result).includes('SYNTHETIC_PRIVATE'));
});

test('无日期网页可解释背景，但不能生成近期事件维度结论',()=>{
 const value=answer();value.dimensions.find(d=>d.id==='events').signal='watch';
 const evidence=aiEvidence({items:news.items.map(x=>({...x,dateSource:'未提供日期',recency:'unverified'}))},null);
 const result=validateAIReport(value,evidence);assert.equal(result.dimensions.find(d=>d.id==='events').signal,'insufficient');
});

test('近三年检索接受两年前报道，排除超过三年的报道，向搜索API传递三年范围',async()=>{
 const response={results:[{title:'测试成长混合A季度报告',url:'https://example.com/within',published_date:'2024-10-29'},{title:'测试成长混合A历史报告',url:'https://example.com/old',published_date:'2022-10-29'}]};
 let request;
 const crawler=createNewsCrawler({clock:()=>now,config:{NEWS_SEARCH_API_KEY:'SYNTHETIC'},fetcher:async(url,options)=>{request=JSON.parse(options.body);return new Response(JSON.stringify(response));}});
 const value=await crawler.search(identity);assert.equal(request.days,1095);assert.equal(value.days,1095);assert.equal(value.items.length,1);assert.equal(value.items[0].url,'https://example.com/within');
});
