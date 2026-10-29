import {calculateMetrics,validateSource} from './assessment.js';
import {assessCosts,allocationObservations,validateUnits} from './financial-rates.js';
import {INVESTOR_INDICATORS,INVESTOR_GROUPS} from './investor-indicators.js';
export const SIMPLE_MODEL_VERSION='zhiheng-investor-4.0';
export const SIMPLE_DIMENSIONS=[{id:'return',name:'净值增长',weight:25,description:'这段时间净值涨了多少？'},{id:'risk',name:'回撤控制',weight:25,description:'从高点最多回落了多少？'},{id:'stability',name:'波动稳定',weight:20,description:'每期净值的起伏有多大？'},{id:'efficiency',name:'收益风险效率',weight:15,description:'承担回落换来了多少净值增长？'},{id:'cost',name:'费用负担',weight:15,description:'管理、托管和销售服务的固定年费有多少？'}];
const round=x=>Math.round(x*100)/100;
const bounded=x=>Math.max(0,Math.min(100,x));
export function scoreAvailableDimensions(assessment){
 const available=assessment.dimensions.filter(d=>Number.isFinite(d.score)&&d.weight>0),coverage=available.reduce((s,d)=>s+d.weight,0);
 return {score:coverage?round(available.reduce((s,d)=>s+d.score*d.weight,0)/coverage):null,coverage,completeScore:null,availableDimensions:available.length,totalDimensions:assessment.dimensions.length,label:available.length>=2?'多维研究参考分':available.length?'单项观察分':'暂无多维评分',formula:'Σ(有效维度分×权重) ÷ 有效权重合计；缺项不计0分',notice:'净值与固定年费研究分，不是产品安全或购买评级；尚未覆盖完整赎回条款和全部费用。不同区间、口径不可直接比较。'};
}
/** 客观读数+公开的自建映射规则；不把模型阈值称为市场客观标准。 */
export function evaluateClassifiedReport(results,context={}){
 const product=context.product||{},template=context.template||{};
 const reasons=[],values={},metricScores=[];let metrics=null,nav=null;
 const units=validateUnits(context.units||{}),costs=assessCosts(results,units.rateUnit),allocation=allocationObservations(results,units.allocationUnit);
 const candidates=[...new Set(['ths_adjustment_nv_fund',(template.field==='ths_accum_unit_nv_fund'?'ths_unit_nv_fund':template.field)||'ths_unit_nv_fund','ths_unit_nv_fund'])].map(field=>results.find(r=>r.field===field&&r.status==='returned-unverified')).filter(Boolean);
 const usable=[];
 for(const row of candidates){
  if(!row.series?.length)continue;
  if(!validateSource(row.source)){reasons.push('净值缺少有效来源，不参与评分。');continue}
  if(row.outsideRequestedRange){reasons.push('净值响应包含区间外记录，不按所选区间评分。');continue}
  try{const m=calculateMetrics(row.series.map(p=>({date:p.date,nav:p.value})),{periodsPerYear:template.periodsPerYear||252});usable.push({row,m})}catch{reasons.push('净值日期、数量或数值不满足计算要求。')}
 }
 const sufficientPath=p=>p.m.observations>=20&&p.m.elapsedDays>=30;const dynamicPath=p=>!p.m.rows.every(r=>Math.abs(r.nav-p.m.rows[0].nav)<1e-10);
 const chosen=usable.find(p=>sufficientPath(p)&&dynamicPath(p))||usable.find(sufficientPath)||usable[0];
 if(chosen){nav=chosen.row;metrics=chosen.m}else reasons.push('未取得足够有效净值；仍独立评估已取得的费用资料。');
 const periodLabel={365:'日度',252:'交易日',52:'周度',12:'月度'}[template.periodsPerYear||252],volatilityLimit={365:.03,252:.03,52:.07,12:.15}[template.periodsPerYear||252];
 const formulas={cost:'管理/托管/销售服务费分别按3%/0.5%/1%映射：截断100×(1−费率/阈值)，子项权重70/20/10；缺项跳过，费用维度有效权重按子项覆盖率折算。交易费和业绩报酬不混入。',return:'区间净值变化=末值/初值−1；分数=截断(50+500×区间变化)，−10%为0、0%为50、+10%为100。',risk:'按有效观测计算最大净值回落；分数=截断(100−500×最大回落)，20%及以上为0。',stability:`${periodLabel}净值涨跌幅的样本标准差；分数=截断(100×(1−波动/${(volatilityLimit*100).toFixed(0)}%))。这是每期波动，不是年化波动。`,efficiency:'区间净值变化÷最大净值回落；分数=截断(50+25×比值)。未观察到回落时不打效率分。'};
 const flat=metrics&&metrics.rows.every(r=>Math.abs(r.nav-metrics.rows[0].nav)<1e-10);
 const unit=nav?.field!=='ths_adjustment_nv_fund'&&template.navBasis!=='adjusted';
 const sufficient=metrics&&metrics.observations>=20&&metrics.elapsedDays>=30;
 if(metrics&&!sufficient)reasons.push('评分至少需要20条有效观测、覆盖30个自然日；短样本只显示读数。');
 if(flat){metrics.annualizedReturn=null;metrics.volatility=null;metrics.downside=null;metrics.sharpe=null;reasons.push((unit?'单位净值恒定':'复权净值恒定')+'，可能是最新快照被重复，不能解释成零风险或生成高分。')}
 // 分红明确存在且单位净值未经复权时，不将除息回落打成投资风险分。
 const distributions=unit&&template.distributions==='yes';
 if(distributions)reasons.push('存在分红且未复权，暂停相关评分，请使用复权/总回报净值。');
 if(sufficient&&!flat&&!distributions){
  values.return=round(bounded(50+500*metrics.periodReturn));
  // 缺测会低估回落；不把明显稀疏序列的已见回落评成低风险。
  if(metrics.regular){if(Number.isFinite(metrics.periodVolatility))values.stability=round(bounded(100*(1-metrics.periodVolatility/volatilityLimit)));values.risk=round(bounded(100-500*metrics.maxDrawdown));if(metrics.maxDrawdown>1e-10)values.efficiency=round(bounded(50+25*metrics.periodReturn/metrics.maxDrawdown));else reasons.push('区间未观察到净值回落，不据此给效率满分。')}
  else reasons.push('采样明显稀疏或频率不匹配，仅评区间净值表现，不评回撤、稳定与效率。');
 }
 if(unit&&template.distributions!=='none')reasons.push('分红处理尚不明确：本分数仅描述原始净值路径，不代表含分红实际收益；除息可能影响回落读数。');
 if(nav?.field==='ths_adjustment_nv_fund')reasons.push('优先采用接口复权净值；累计单位净值仅作补充，不当作分红再投资总回报。');
 else if(!template.basisConfirmed)reasons.push('模板口径未全部核对，当前为净值观察分，不视为总回报评价。');
 if(Number.isFinite(costs.score)){values.cost=costs.score;metricScores.push({id:'cost',dimension:'cost',name:costs.total===null?'已知固定年费（至少）':'固定年费合计',value:costs.knownTotal,score:costs.score,display:'percent',formula:formulas.cost,source:costs.items[0].source,sources:costs.items.map(i=>i.source),date:costs.date})}
 if(costs.score===null&&results.some(r=>r.group==='fees'&&r.status==='returned-unverified'&&r.series?.length))reasons.push(costs.notice);
 const dimensions=SIMPLE_DIMENSIONS.map(d=>({...d,configuredWeight:d.weight,weight:d.id==='cost'?d.weight*(costs.coverage||0)/100:d.weight,description:d.id==='cost'&&costs.score!==null?costs.notice:d.description,score:values[d.id]??null,status:Number.isFinite(values[d.id])?'calculated':'unavailable',formula:formulas[d.id],source:Number.isFinite(values[d.id])?(d.id==='cost'?costs.items[0].source:nav.source):null}));
 if(metrics){for(const [id,name,value]of [['return','区间净值变化',metrics.periodReturn],['risk','最大净值回落',metrics.maxDrawdown],['stability',periodLabel+'波动',metrics.periodVolatility],['efficiency','收益风险效率',metrics.maxDrawdown>1e-10?metrics.periodReturn/metrics.maxDrawdown:null]])if(Number.isFinite(values[id]))metricScores.push({id,dimension:id,name,value,score:values[id],display: id==='efficiency'?'ratio':'percent',formula:formulas[id],source:nav.source})}
 const assessment={name:product.name||product.code,modelVersion:SIMPLE_MODEL_VERSION,dimensions,compositeScore:null,warnings:reasons};
 const summary=scoreAvailableDimensions(assessment);if(metrics&&unit&&template.distributions!=='none')summary.notice='分红未核对，仅原始净值观察，不代表实际总收益。'+summary.notice;assessment.coverage=summary.coverage;assessment.partialScore=summary.score;
 const analysis=metrics&&flat?[`实际日期 ${metrics.startDate} 至 ${metrics.endDate}，共${metrics.observations}条记录，净值全部相同；不把重复快照当成动态历史业绩。`]:metrics?[`实际净值区间 ${metrics.startDate} 至 ${metrics.endDate}，${metrics.elapsedDays} 天、${metrics.observations} 条有效观测；净值变化 ${(metrics.periodReturn*100).toFixed(2)}%，已观察最大回落 ${(metrics.maxDrawdown*100).toFixed(2)}%。`,'缺少官方回撤、夏普等字段时使用同一净值序列复算，不把复算值标成同花顺直接提供；股票、债券、存款和收益风险指标仅保留与投资者有关的清晰读数。净值四维来自同一价格路径，固定年费独立评价；不代表信用或赎回能力。']:Number.isFinite(costs.score)?['没有动态净值评分依据，本次仅为已知费用的单项观察，不视为完整多维评价。']:['没有足够可评分依据；原始有效字段仍保留。'];
 return {assessment,metrics,metricScores,summary,reasons,analysis,costs,allocation,navField:nav?.field||null,units};
}
export function classifiedGroups(results){return Object.entries(INVESTOR_GROUPS).map(([id,name])=>{const rows=results.filter(r=>r.group===id);return {id,name,valid:rows.filter(r=>r.series.length&&r.status==='returned-unverified').length,total:rows.length,items:rows}})}
export function emptyClassifiedRows(selectedGroups){return INVESTOR_INDICATORS.map(d=>({...d,status:selectedGroups.includes(d.group)?'not-tested':'not-selected',series:[],notice:selectedGroups.includes(d.group)?'尚未查询':'本次未选择此分类',score:null,scoreReason:'原值供分析参考；有有效净值时独立计算净值与费用维度，不把规模/久期简单按大小打分'}))}
