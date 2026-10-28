import {assess,assessEvidenceOnly,calculateMetrics,DIMENSIONS,PROFILES} from './assessment.js';
import {SUPPLIED_INDICATORS,INDICATOR_GROUPS} from './indicator-catalog.js';
const round=x=>Math.round(x*100)/100;
const bounded=x=>Math.max(0,Math.min(100,x));
export function scoreAvailableDimensions(assessment){
 const available=assessment.dimensions.filter(d=>Number.isFinite(d.score)&&d.weight>0);
 const coverage=available.reduce((s,d)=>s+d.weight,0);
 const score=coverage?round(available.reduce((s,d)=>s+d.score*d.weight,0)/coverage):null;
 return {score,coverage,completeScore:assessment.compositeScore??null,availableDimensions:available.length,totalDimensions:assessment.dimensions.length,label:assessment.compositeScore===null||assessment.compositeScore===undefined?'已覆盖维度综合参考分':'综合参考分',formula:'Σ(有效维度分×该维度权重) ÷ 有效权重合计；缺项不计0分',notice:coverage<80?'资料覆盖不足，当前分数仅代表已覆盖维度，不是完整评估。':'请同时关注核心维度是否齐全与本次产品、区间、数据口径。'};
}
export function evaluateClassifiedReport(results,context={}){
 const product=context.product||{},template=context.template||{},evidence=context.evidence||{};
 let assessment=assessEvidenceOnly({name:product.name||product.code,evidence,reason:'按已取得的有效材料计算；缺失项不计0分。'}),metrics=null;
 const nav=results.find(r=>r.field===template.field&&r.status==='returned-unverified');
 const reasons=[];
 if(nav?.outsideRequestedRange)reasons.push('净值响应包含区间外记录，不按所选区间解释评分。');
 if(!nav?.series.length)reasons.push('未取得有效净值序列。');
 if(nav?.series.length>=2){try{metrics=calculateMetrics(nav.series.map(r=>({date:r.date,nav:r.value})),{periodsPerYear:template.periodsPerYear||252})}catch{reasons.push('净值序列无法计算，其他字段继续显示。')}}
 if(metrics&&!metrics.eligible)reasons.push('年化指标需要至少90天、30条有效观测和匹配的采样频率；短样本继续展示原值。');
 const flatUnit=metrics&&template.navBasis==='unit'&&metrics.rows.every(r=>Math.abs(r.nav-metrics.rows[0].nav)<1e-10);
 if(flatUnit)reasons.push('单位净值恒定，不能据此给收益或风险打高分。');
 if(!template.basisConfirmed)reasons.push('当前净值模板的总回报、费用和采样口径未确认。');
 if(template.navBasis==='unit'&&template.distributions!=='none')reasons.push('分红处理不明确，单位净值不直接当作总回报评分。');
 if(!product.type||!product.riskLevel||!product.currency)reasons.push('产品分类、风险或币种不齐全，收益风险阈值不擅自选择。');
 if(metrics&&!reasons.length){try{assessment=assess({id:product.code,name:product.name,type:product.type,riskLevel:product.riskLevel,currency:product.currency,series:metrics.rows,source:nav.source,navBasis:template.navBasis,feeBasis:template.feeBasis,hasDistributions:template.distributions==='yes',options:{periodsPerYear:template.periodsPerYear},evidence,peers:context.peers||[]})}catch{reasons.push('现有材料未达到评分要求，继续保留原始指标与已证实材料。')}}
 const metricScores=[];
 if(Number.isFinite(assessment.dimensions.find(d=>d.id==='return')?.score)&&metrics){metricScores.push({id:'annual-return',dimension:'return',name:'平台计算年化收益',value:metrics.annualizedReturn,score:assessment.dimensions.find(d=>d.id==='return').score,formula:'采用公开的产品类别收益映射区间',source:nav.source})}
 if(Number.isFinite(assessment.dimensions.find(d=>d.id==='risk')?.score)&&metrics&&PROFILES[product.type]){const p=PROFILES[product.type];metricScores.push({id:'drawdown',dimension:'risk',name:'平台计算最大回撤',value:metrics.maxDrawdown,score:round(bounded(100*(1-metrics.maxDrawdown/p.drawdownLimit))),formula:`截断100×(1−最大回撤/${p.drawdownLimit})；维度以原始风险比值的60%合并后截断`,source:nav.source},{id:'volatility',dimension:'risk',name:'平台计算年化波动',value:metrics.volatility,score:round(bounded(100*(1-metrics.volatility/p.volatilityLimit))),formula:`截断100×(1−年化波动/${p.volatilityLimit})；维度以原始风险比值的40%合并后截断`,source:nav.source})}
 const asset=assessment.dimensions.find(d=>d.id==='assets');if(Number.isFinite(asset?.score))metricScores.push({id:'disclosed-assets',dimension:'assets',name:'已披露资产明细覆盖',value:asset.score/100,score:asset.score,formula:asset.formula,source:asset.source});
 return {assessment,metrics,metricScores,summary:scoreAvailableDimensions(assessment),reasons};
}
export function classifiedGroups(results){return Object.entries(INDICATOR_GROUPS).map(([id,name])=>{const rows=results.filter(r=>r.group===id);return {id,name,valid:rows.filter(r=>r.series.length&&r.status==='returned-unverified').length,total:rows.length,items:rows}})}
export function emptyClassifiedRows(selectedGroups){return SUPPLIED_INDICATORS.map(d=>({...d,status:selectedGroups.includes(d.group)?'not-tested':'not-selected',series:[],notice:selectedGroups.includes(d.group)?'尚未查询':'本次未选择此分类',score:null,scoreReason:'原值仅作为输入或参考；不把净值、规模和久期简单按数值大小打分'}))}
