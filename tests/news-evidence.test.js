import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNewsRSS,parseEastmoneyNews,newsRelevance,newsLink,quantitativeEvidence,validateAIReport,aiEvidence} from '../lib/news-evidence.js';
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
