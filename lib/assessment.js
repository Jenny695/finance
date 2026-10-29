/** 可解释研究模型；不是收益预测、信用评级或适当性建议。所有百分比输入均为小数。 */
export const MODEL_VERSION = 'zhiheng-research-1.1';
export const DIMENSIONS = [
  {id:'return',name:'收益表现',weight:25}, {id:'risk',name:'风险回撤',weight:25},
  {id:'assets',name:'底层资产透明度',weight:10}, {id:'liquidity',name:'流动性',weight:10},
  {id:'disclosure',name:'信息披露质量',weight:15},
  {id:'peer',name:'同类横向对比',weight:15},
];
export const PROFILES = {
 fixed:{label:'固定收益类',returnFloor:-.03,returnCeiling:.06,drawdownLimit:.05,volatilityLimit:.08},
 mixed:{label:'混合类',returnFloor:-.1,returnCeiling:.15,drawdownLimit:.2,volatilityLimit:.25},
 cash:{label:'现金管理类',returnFloor:0,returnCeiling:.03,drawdownLimit:.01,volatilityLimit:.02},
 equity:{label:'权益类',returnFloor:-.2,returnCeiling:.25,drawdownLimit:.4,volatilityLimit:.4},
};
const DAY = 86400000;
const clamp = x=>Math.max(0,Math.min(100,x));
const round = x=>Number.isFinite(x)?Math.round(x*100)/100:null;
const number = x=>typeof x==='number'&&Number.isFinite(x);
function day(date){if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('日期必须为 YYYY-MM-DD');const t=Date.parse(date+'T00:00:00Z');if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==date)throw Error('存在无效日期');return t}
export function normalizeSeries(rows){
 if(!Array.isArray(rows)||rows.length<2)throw Error('至少需要两条净值记录');
 if(rows.length>15000)throw Error('净值记录不能超过 15000 条');
 const seen=new Set();return rows.map(row=>{const date=Array.isArray(row)?row[0]:row.date;const value=Array.isArray(row)?row[1]:row.nav;day(date);if(!number(value)||value<=0)throw Error('净值必须是大于零的有限数字');if(seen.has(date))throw Error('存在重复日期，请先核对数据');seen.add(date);return {date,nav:value}}).sort((a,b)=>a.date.localeCompare(b.date));
}
export function calculateMetrics(input,{periodsPerYear=252,riskFreeRate=0}={}){
 if(![12,52,252,365].includes(periodsPerYear))throw Error('请选择月、周、交易日或自然日采样频率');
 if(!number(riskFreeRate)||riskFreeRate<0||riskFreeRate>.2)throw Error('无风险利率参数应在 0%—20% 之间');
 const rows=normalizeSeries(input);const first=rows[0],last=rows.at(-1);const elapsed=(day(last.date)-day(first.date))/DAY;
 const returns=rows.slice(1).map((r,i)=>r.nav/rows[i].nav-1);
 if(returns.some(v=>!Number.isFinite(v)||v<=-1))throw Error('净值比例超出可计算范围，请核对数据');
 const gaps=rows.slice(1).map((r,i)=>(day(r.date)-day(rows[i].date))/DAY);
 const gapLimit={12:45,52:14,252:10,365:3}[periodsPerYear];
 const medianGap=[...gaps].sort((a,b)=>a-b)[Math.floor(gaps.length/2)];
 const expected={12:[20,40],52:[4,10],252:[1,3],365:[1,1]}[periodsPerYear];
 const regular=gaps.every(g=>g<=gapLimit)&&medianGap>=expected[0]&&medianGap<=expected[1];
 const mean=returns.reduce((s,v)=>s+v,0)/returns.length;
 const variance=returns.length>1?returns.reduce((s,v)=>s+(v-mean)**2,0)/(returns.length-1):null;
 // 年化指标仅在 >=90 个自然日、>=30条观测且采样频率通过检查后展示。
 const eligible=elapsed>=90&&rows.length>=30&&regular;
 const growth=eligible?Math.pow(last.nav/first.nav,365.25/elapsed)-1:null;
 const annualizedReturn=Number.isFinite(growth)?growth:null;
 const volatility=eligible&&variance!==null?Math.sqrt(variance*periodsPerYear):null;
 const downside=eligible?Math.sqrt(returns.reduce((s,v)=>s+Math.min(v,0)**2,0)/returns.length*periodsPerYear):null;
 let peak=first.nav,maxDrawdown=0,peakDate=first.date,troughDate=first.date,drawdownStart=first.date;
 for(const r of rows){if(r.nav>peak){peak=r.nav;peakDate=r.date}const dd=1-r.nav/peak;if(dd>maxDrawdown){maxDrawdown=dd;drawdownStart=peakDate;troughDate=r.date}}
 return {rows,observations:rows.length,startDate:first.date,endDate:last.date,elapsedDays:elapsed,periodVolatility:variance===null?null:Math.sqrt(variance),periodReturn:last.nav/first.nav-1,annualizedReturn,volatility,downside,sharpe:volatility>1e-12?(annualizedReturn-riskFreeRate)/volatility:null,maxDrawdown,drawdownStart,troughDate,positivePeriods:returns.filter(x=>x>0).length/returns.length,regular,eligible,periodsPerYear,riskFreeRate,warnings:[...(!regular?['采样间隔与所选频率不符，年化指标不计算。']:[]),...(!eligible?['年化指标需要至少90天、30条观测及有效采样频率。']:[])]};
}
export function validateSource(source){
 if(!source||typeof source!=='object')return false;
 try{const u=new URL(source.url);return u.protocol==='https:'&&!u.username&&!u.password&&typeof source.title==='string'&&source.title.trim().length>0&&typeof source.provider==='string'&&source.provider.trim().length>0&&!!source.retrievedAt&&Number.isFinite(Date.parse(source.retrievedAt))}catch{return false}
}
function evidence(input,id){const item=input.evidence?.[id];return item&&item.confirmed===true&&validateSource(item.source)?item:null}
function peerScore(input,metrics){
 if(!Array.isArray(input.peers)||input.peers.length<5)return null;
 const valid=input.peers.filter(p=>p.type===input.type&&p.riskLevel===input.riskLevel&&p.startDate===metrics.startDate&&p.endDate===metrics.endDate&&p.navBasis===input.navBasis&&p.feeBasis===input.feeBasis&&p.currency===input.currency&&p.id!==input.id&&number(p.periodReturn)&&validateSource(p.source));
 const unique=[...new Map(valid.map(p=>[p.id,p])).values()];if(unique.length<5||unique.some(p=>!p.id))return null;
 const below=unique.filter(p=>p.periodReturn<metrics.periodReturn).length;const tied=unique.filter(p=>Math.abs(p.periodReturn-metrics.periodReturn)<1e-12).length;
 return {value:100*(below+.5*tied)/unique.length,sample:unique.length};
}
export function assess(input,weights=Object.fromEntries(DIMENSIONS.map(d=>[d.id,d.weight]))){
 if(!input||!PROFILES[input.type])throw Error('请选择有效产品类型');
 if(!['unit','adjusted'].includes(input.navBasis))throw Error('请选择单位净值或已复权净值口径');
 if(!['net','gross'].includes(input.feeBasis))throw Error('请选择费后或费前口径');
 if(!input.currency||!input.riskLevel)throw Error('请填写币种和风险等级');
 if(!validateSource(input.source))throw Error('请填写有效的 HTTPS 数据来源、文件名称、提供方和获取时间');
 for(const d of DIMENSIONS)if(!number(weights[d.id])||weights[d.id]<0||weights[d.id]>100)throw Error('各维度权重应在0—100之间');
 if(Math.abs(DIMENSIONS.reduce((s,d)=>s+weights[d.id],0)-100)>.001)throw Error('权重合计必须为100%');
 const metrics=calculateMetrics(input.series,input.options);const profile=PROFILES[input.type];const values={};const notes={};
 const hasDistributions=!!input.hasDistributions;
 const flatUnit=input.navBasis==='unit'&&metrics.rows.every(r=>Math.abs(r.nav-metrics.rows[0].nav)<1e-10);
 const navUsable=!(hasDistributions&&input.navBasis!=='adjusted')&&!flatUnit;
 if(flatUnit)metrics.warnings.push('单位净值恒定，无法据此解释总回报与真实风险，停止收益、风险和同类维度评分。');
 if(hasDistributions&&input.navBasis!=='adjusted')metrics.warnings.push('存在分红但未使用复权净值，收益、风险和同类维度停止评分。');
 if(navUsable&&metrics.eligible&&number(metrics.annualizedReturn)&&number(metrics.volatility)){
 values.return=clamp((metrics.annualizedReturn-profile.returnFloor)/(profile.returnCeiling-profile.returnFloor)*100);
 values.risk=clamp(100*(1-.6*metrics.maxDrawdown/profile.drawdownLimit-.4*metrics.volatility/profile.volatilityLimit));
 }
 notes.return=`收益分=截断至0—100的(年化收益-${profile.returnFloor*100}%)/(${profile.returnCeiling*100}%-${profile.returnFloor*100}%)×100。区间为自建模型参数，非市场基准。`;
 notes.risk=`风险分=截断至0—100的100×(1-0.6×回撤/${profile.drawdownLimit*100}%-0.4×波动率/${profile.volatilityLimit*100}%)。阈值为自建模型参数。`;
 const asset=evidence(input,'assets');if(asset&&Array.isArray(asset.allocations)&&asset.allocations.length){const allocations=asset.allocations;if(allocations.every(a=>typeof a.name==='string'&&a.name.trim()&&number(a.weight)&&a.weight>=0&&a.weight<=100)&&Math.abs(allocations.reduce((s,a)=>s+a.weight,0)-100)<.01&&number(asset.lookthroughCoverage)&&asset.lookthroughCoverage>=0&&asset.lookthroughCoverage<=100){values.assets=asset.lookthroughCoverage;notes.assets='按原始报告可穿透资产占比评分；不以债券占比代替资产安全性判断。'}}
 const liq=evidence(input,'liquidity');if(liq&&number(liq.lockDays)&&number(liq.settlementDays)&&liq.lockDays>=0&&liq.settlementDays>=0&&['daily','weekly','monthly','closed'].includes(liq.window)){const penalty={daily:0,weekly:10,monthly:25,closed:40}[liq.window];values.liquidity=clamp(100-Math.min(50,liq.lockDays/365*50)-Math.min(20,liq.settlementDays*2)-penalty);notes.liquidity='100－锁定期扣分(每365天50分，上限50)－到账天数扣分(每天2分，上限20)－开放窗口扣分(日0/周10/月25/封闭40)。'}
 const disclosure=evidence(input,'disclosure');if(disclosure&&['prospectus','periodicReport','redemptionRules','fees','onTime'].every(k=>typeof disclosure[k]==='boolean')){values.disclosure=['prospectus','periodicReport','redemptionRules','fees','onTime'].filter(k=>disclosure[k]).length*20;notes.disclosure='说明书、定期报告、赎回规则、费用、按时披露五项各20分。由用户对照原文确认，尚未自动核验内容。'}
 const peer=navUsable&&metrics.eligible?peerScore(input,metrics):null;if(peer){values.peer=peer.value;notes.peer=`严格匹配类型、风险、日期、币种、费用和净值口径的${peer.sample}只去重样本；收益分位数，同收益取中位秩。样本不足5只不评分。`}
 const dimensions=DIMENSIONS.map(d=>({ ...d,weight:weights[d.id],score:round(values[d.id]),status:number(values[d.id])?'calculated':'unavailable',formula:notes[d.id]||'缺少有效来源或所需字段，暂不评分。',source:['return','risk','peer'].includes(d.id)?input.source:input.evidence?.[d.id]?.source||null }));
 const coverage=dimensions.filter(d=>d.score!==null).reduce((s,d)=>s+d.weight,0);
 const weighted=dimensions.reduce((s,d)=>s+(d.score??0)*d.weight,0);
 const partialScore=coverage>0?round(weighted/coverage):null;
 const sufficient=coverage>=80&&values.return!==undefined&&values.risk!==undefined&&values.disclosure!==undefined&&weights.return>0&&weights.risk>0&&weights.disclosure>0;
 return {modelVersion:MODEL_VERSION,calculatedAt:new Date().toISOString(),inputStatus:input.mode==='demo'?'demo':'user-supplied-unverified',name:input.name||'未命名产品',metrics,dimensions,coverage,partialScore,compositeScore:sufficient?partialScore:null,scoreStatus:sufficient?'参考综合分':'资料不足，暂不出具综合分',source:input.source,warnings:[...metrics.warnings,...(input.navBasis==='unit'?['单位净值口径不含分红再投资，须核对是否存在分红。']:[]),'来源链接与人工摘录尚未自动核验；评分是研究模型结果，不是投资建议。']};
}

/** 仅评有来源的已披露资产明细，不为未知的收益、风险、机构资料填分。 */
export function assessEvidenceOnly({name='',evidence={},reason='缺少完整收益与风险口径，暂不出具综合分'}={}){
 const asset=evidence.assets;
 const valid=asset?.confirmed===true&&validateSource(asset.source)&&Array.isArray(asset.allocations)&&asset.allocations.length>0&&asset.allocations.every(a=>number(a.weight)&&a.weight>=0&&a.weight<=100)&&Math.abs(asset.allocations.reduce((s,a)=>s+a.weight,0)-100)<.01&&number(asset.lookthroughCoverage)&&asset.lookthroughCoverage>=0&&asset.lookthroughCoverage<=100;
 const dimensions=DIMENSIONS.map(d=>({...d,score:d.id==='assets'&&valid?round(asset.lookthroughCoverage):null,status:d.id==='assets'&&valid?'calculated':'unavailable',name:d.id==='assets'?'已披露资产明细覆盖':d.name,formula:d.id==='assets'&&valid?(asset.coverageBasis||'按原文已披露明细占比计算')+'。仅衡量材料覆盖，不等同完整穿透、信用质量或资金安全；报告历史时点须单独查看。':'未取得足以支持该维度的证据，未补造或推断。',source:d.id==='assets'&&valid?asset.source:null}));
 return {name,modelVersion:MODEL_VERSION,dimensions,coverage:valid?10:0,partialScore:valid?round(asset.lookthroughCoverage):null,compositeScore:null,scoreStatus:reason,warnings:[reason,'局部资产明细参考分不代表综合投资价值或当前风险。'],calculatedAt:new Date().toISOString()};
}
