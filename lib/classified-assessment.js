import {calculateMetrics,validateSource} from './assessment.js';
import {INVESTOR_INDICATORS,INVESTOR_GROUPS} from './investor-indicators.js';
export const SIMPLE_MODEL_VERSION='zhiheng-investor-3.0';
export const SIMPLE_DIMENSIONS=[{id:'return',name:'净值增长',weight:30,description:'这段时间净值涨了多少？'},{id:'risk',name:'回撤控制',weight:30,description:'从高点最多回落了多少？'},{id:'stability',name:'波动稳定',weight:20,description:'每期净值的起伏有多大？'},{id:'efficiency',name:'收益风险效率',weight:20,description:'承担回落换来了多少净值增长？'}];
const round=x=>Math.round(x*100)/100;
const bounded=x=>Math.max(0,Math.min(100,x));
export function scoreAvailableDimensions(assessment){
 const available=assessment.dimensions.filter(d=>Number.isFinite(d.score)&&d.weight>0),coverage=available.reduce((s,d)=>s+d.weight,0);
 return {score:coverage?round(available.reduce((s,d)=>s+d.score*d.weight,0)/coverage):null,coverage,completeScore:null,availableDimensions:available.length,totalDimensions:assessment.dimensions.length,label:available.length>=2?'多维研究参考分':available.length?'单项观察分':'暂无多维评分',formula:'Σ(有效维度分×权重) ÷ 有效权重合计；缺项不计0分',notice:'仅评价所选区间的净值变化；不是信用评级、同类排名或购买建议。不同区间、口径的分数不可直接比较。'};
}
/** 客观读数+公开的自建映射规则；不把模型阈值称为市场客观标准。 */
export function evaluateClassifiedReport(results,context={}){
 const product=context.product||{},template=context.template||{};
 const nav=results.find(r=>r.field===(template.field||'ths_unit_nv_fund')&&r.status==='returned-unverified');
 const reasons=[],values={},metricScores=[];let metrics=null;
 const periodLabel={365:'日度',252:'交易日',52:'周度',12:'月度'}[template.periodsPerYear||252],volatilityLimit={365:.03,252:.03,52:.07,12:.15}[template.periodsPerYear||252];
 const formulas={return:'区间净值变化=末值/初值−1；分数=截断(50+500×区间变化)，−10%为0、0%为50、+10%为100。',risk:'按有效观测计算最大净值回落；分数=截断(100−500×最大回落)，20%及以上为0。',stability:`${periodLabel}净值涨跌幅的样本标准差；分数=截断(100×(1−波动/${(volatilityLimit*100).toFixed(0)}%))。这是每期波动，不是年化波动。`,efficiency:'区间净值变化÷最大净值回落；分数=截断(50+25×比值)。未观察到回落时不打效率分。'};
 if(!nav?.series?.length)reasons.push('未取得有效净值序列；其他原始指标仍可查看。');
 else if(!validateSource(nav.source))reasons.push('净值缺少有效来源，不参与评分。');
 else if(nav.outsideRequestedRange)reasons.push('净值响应包含区间外记录，不按所选区间评分。');
 else try{metrics=calculateMetrics(nav.series.map(r=>({date:r.date,nav:r.value})),{periodsPerYear:template.periodsPerYear||252})}catch{reasons.push('净值日期、数量或数值不满足计算要求。')}
 const flat=metrics&&metrics.rows.every(r=>Math.abs(r.nav-metrics.rows[0].nav)<1e-10);
 const unit=template.navBasis!=='adjusted';
 const sufficient=metrics&&metrics.observations>=20&&metrics.elapsedDays>=30;
 if(metrics&&!sufficient)reasons.push('评分至少需要20条有效观测、覆盖30个自然日；短样本只显示读数。');
 if(flat&&unit)reasons.push('单位净值恒定，可能未体现分红或收益分配，不能解释成零风险或生成高分。');
 // 分红明确存在且单位净值未经复权时，不将除息回落打成投资风险分。
 const distributions=unit&&template.distributions==='yes';
 if(distributions)reasons.push('存在分红且未复权，暂停相关评分，请使用复权/总回报净值。');
 if(sufficient&&!(flat&&unit)&&!distributions){
  values.return=round(bounded(50+500*metrics.periodReturn));
  // 缺测会低估回落；不把明显稀疏序列的已见回落评成低风险。
  if(metrics.regular){if(Number.isFinite(metrics.periodVolatility))values.stability=round(bounded(100*(1-metrics.periodVolatility/volatilityLimit)));values.risk=round(bounded(100-500*metrics.maxDrawdown));if(metrics.maxDrawdown>1e-10)values.efficiency=round(bounded(50+25*metrics.periodReturn/metrics.maxDrawdown));else reasons.push('区间未观察到净值回落，不据此给效率满分。')}
  else reasons.push('采样明显稀疏或频率不匹配，仅评区间净值表现，不评回撤、稳定与效率。');
 }
 if(unit&&template.distributions!=='none')reasons.push('分红处理尚不明确：本分数仅描述原始净值路径，不代表含分红实际收益；除息可能影响回落读数。');
 if(!template.basisConfirmed)reasons.push('模板口径未全部核对，当前为净值观察分，不视为总回报评价。');
 const dimensions=SIMPLE_DIMENSIONS.map(d=>({...d,score:values[d.id]??null,status:Number.isFinite(values[d.id])?'calculated':'unavailable',formula:formulas[d.id],source:Number.isFinite(values[d.id])?nav.source:null}));
 if(metrics){for(const [id,name,value]of [['return','区间净值变化',metrics.periodReturn],['risk','最大净值回落',metrics.maxDrawdown],['stability',periodLabel+'波动',metrics.periodVolatility],['efficiency','收益风险效率',metrics.maxDrawdown>1e-10?metrics.periodReturn/metrics.maxDrawdown:null]])if(Number.isFinite(values[id]))metricScores.push({id,dimension:id,name,value,score:values[id],display: id==='efficiency'?'ratio':'percent',formula:formulas[id],source:nav.source})}
 const assessment={name:product.name||product.code,modelVersion:SIMPLE_MODEL_VERSION,dimensions,compositeScore:null,warnings:reasons};
 const summary=scoreAvailableDimensions(assessment);if(unit&&template.distributions!=='none')summary.notice='分红未核对，仅原始净值观察，不代表实际总收益。'+summary.notice;assessment.coverage=summary.coverage;assessment.partialScore=summary.score;
 const analysis=metrics?[`实际净值区间 ${metrics.startDate} 至 ${metrics.endDate}，${metrics.elapsedDays} 天、${metrics.observations} 条有效观测；净值变化 ${(metrics.periodReturn*100).toFixed(2)}%，已观察最大回落 ${(metrics.maxDrawdown*100).toFixed(2)}%。`,'缺少官方回撤、夏普等字段时使用同一净值序列复算，不把复算值标成同花顺直接提供；股票、债券、存款和收益风险指标仅保留与投资者有关的清晰读数。四个评分维度均来自同一净值路径，不代表信用或赎回能力。']:['没有可解释的净值路径，暂不生成研究分；原始有效字段仍保留。'];
 return {assessment,metrics,metricScores,summary,reasons,analysis};
}
export function classifiedGroups(results){return Object.entries(INVESTOR_GROUPS).map(([id,name])=>{const rows=results.filter(r=>r.group===id);return {id,name,valid:rows.filter(r=>r.series.length&&r.status==='returned-unverified').length,total:rows.length,items:rows}})}
export function emptyClassifiedRows(selectedGroups){return INVESTOR_INDICATORS.map(d=>({...d,status:selectedGroups.includes(d.group)?'not-tested':'not-selected',series:[],notice:selectedGroups.includes(d.group)?'尚未查询':'本次未选择此分类',score:null,scoreReason:'原值供分析参考；有有效净值时独立计算四个净值维度，不把规模/久期简单按大小打分'}))}
