import {officialObservation} from './official-observations.js';
import {researchMetrics,evaluateDecision,officialPeerContext} from './investor-research.js';
import {calculateMetrics,validateSource} from './assessment.js';
import {assessCosts,allocationObservations,validateUnits} from './financial-rates.js';
import {INVESTOR_INDICATORS,INVESTOR_GROUPS} from './investor-indicators.js';
export const SIMPLE_MODEL_VERSION='zhiheng-investor-5.0';
export const SIMPLE_DIMENSIONS=[
 {id:'return',name:'收益表现',weight:20,description:'观察期内净值增长'},
 {id:'risk',name:'回撤控制',weight:20,description:'从净值高点到低点的最大回落'},
 {id:'stability',name:'波动稳定',weight:15,description:'持有过程中的整体起伏'},
 {id:'efficiency',name:'风险收益效率',weight:15,description:'承担风险换来的历史收益'},
 {id:'downside',name:'下跌防御',weight:10,description:'单独衡量负收益方向的波动'},
 {id:'recovery',name:'回撤修复',weight:10,description:'低于历史高点的时间与修复过程'},
 {id:'cost',name:'费用成本',weight:10,description:'已知固定持有费率'}
];
const round=x=>Math.round(x*100)/100;
const bounded=x=>Math.max(0,Math.min(100,x));
export function scoreAvailableDimensions(assessment){
 const available=assessment.dimensions.filter(d=>Number.isFinite(d.score)&&d.weight>0),coverage=available.reduce((s,d)=>s+d.weight,0);
 return {score:coverage?round(available.reduce((s,d)=>s+d.score*d.weight,0)/coverage):null,coverage:round(coverage),contributions:available.map(d=>({id:d.id,name:d.name,score:d.score,configuredWeight:d.configuredWeight??d.weight,effectiveWeight:d.weight,normalizedWeight:round(d.weight/coverage*100),points:round(d.score*d.weight/coverage)})),completeScore:null,availableDimensions:available.length,totalDimensions:assessment.dimensions.length,label:available.length>=2?'多维研究参考分':available.length?'单项观察分':'暂无多维评分',formula:'Σ(有效维度分×权重) ÷ 有效权重合计；缺项不计0分',notice:'历史表现和费用研究模型；不等同买卖指令。不同类别、观察区间和统计口径不可直接排名；多个维度来自同一净值路径。'};
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
  try{const m=calculateMetrics(row.series.map(p=>({date:p.date,nav:p.value})),{sampling:'observed'});usable.push({row,m})}catch{reasons.push('净值日期、数量或数值不满足计算要求。')}
 }
 const sufficientPath=p=>p.m.observations>=20&&p.m.elapsedDays>=30;const dynamicPath=p=>!p.m.rows.every(r=>Math.abs(r.nav-p.m.rows[0].nav)<1e-10);
 const chosen=usable.find(p=>sufficientPath(p)&&dynamicPath(p))||usable.find(sufficientPath)||usable[0];
 if(chosen){nav=chosen.row;metrics=chosen.m}else reasons.push('未取得足够有效净值；仍独立评估已取得的费用资料。');
 const periodLabel={365:'日度',252:'交易日',52:'周度',12:'月度'}[metrics?.periodsPerYear||252],volatilityLimit={365:.03,252:.03,52:.07,12:.15}[metrics?.periodsPerYear||252];
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

 if(metrics){for(const [id,name,value]of [['return','区间净值变化',metrics.periodReturn],['risk','最大净值回落',metrics.maxDrawdown],['stability',periodLabel+'波动',metrics.periodVolatility],['efficiency','收益风险效率',metrics.maxDrawdown>1e-10?metrics.periodReturn/metrics.maxDrawdown:null]])if(Number.isFinite(values[id]))metricScores.push({id,dimension:id,name,value,score:values[id],display: id==='efficiency'?'ratio':'percent',formula:formulas[id],source:nav.source})}
 const research=sufficient&&!flat&&!distributions?researchMetrics(metrics):null;
 if(research){
  values.downside=round(bounded(100*(1-research.downsideDeviation/volatilityLimit)));
  formulas.downside=`负收益平方均值的平方根；分数=截断100×(1−下行波动/${volatilityLimit*100}%)。与整体波动分开描述，不重复叠加原始指标。`;
  metricScores.push({id:'downside',dimension:'downside',name:'下行波动',value:research.downsideDeviation,score:values.downside,display:'percent',formula:formulas.downside,source:nav.source});
  if(metrics.elapsedDays>=90){values.recovery=round(bounded(100*(1-.6*research.underwaterFraction-.4*research.longestUnderwaterDays/metrics.elapsedDays)));formulas.recovery='截断100×[1−0.6×低于历史高点的时间占比−0.4×最长未修复天数/观察天数]；至少90天，不将未恢复区间当作已恢复。';metricScores.push({id:'recovery',dimension:'recovery',name:'低于高点的时间占比',value:research.underwaterFraction,score:values.recovery,display:'percent',formula:formulas.recovery,source:nav.source})}
 }
 // Published statistics can independently support a dimension when a NAV path cannot.
 // Their provider-defined horizon is retained, never relabelled as the requested NAV window.
 const fallbacks=[
  {id:'return',fields:['ths_annual_yield_fund'],kind:'percent',name:'接口年化收益',score:v=>50+500*v,formula:'iFinD年化收益默认参数口径；分数=截断(50+500×年化收益率)，不当作本次净值区间收益。'},
  {id:'risk',fields:['ths_max_retrace_rate_all_fund'],kind:'percent',name:'接口最大回撤',score:v=>100-500*Math.abs(v),formula:'iFinD最大回撤默认统计口径；分数=截断(100−500×回撤绝对幅度)，不标成同区间复算。'},
  {id:'stability',fields:['ths_annual_volatility_fund'],kind:'percent',name:'接口年化波动',score:v=>100*(1-v/.3),formula:'iFinD年化波动默认参数口径；分数=截断100×(1−年化波动/30%)。'},
  {id:'efficiency',fields:['ths_sharp_annual_fund','ths_sortino_annul_fund','ths_calmar_ratio_fund'],kind:'ratio',name:'接口风险收益比率',score:v=>50+25*v,formula:'依次使用年化夏普、索提诺或卡玛中首个有效值，不重复加分；分数=截断(50+25×比率)。无风险利率和窗口沿用提供方参数。'}
 ];
 for(const rule of fallbacks){if(Number.isFinite(values[rule.id]))continue;const observation=rule.fields.map(field=>officialObservation(results,field,{kind:rule.kind,unit:units.performanceUnit})).find(Boolean);if(!observation||rule.id==='stability'&&observation.value<0||rule.id==='return'&&observation.value< -1||rule.id==='risk'&&Math.abs(observation.value)>1||flat&&['risk','stability'].includes(rule.id)&&observation.value===0)continue;values[rule.id]=round(bounded(rule.score(observation.value)));formulas[rule.id]=rule.formula;metricScores.push({id:rule.id,dimension:rule.id,name:results.find(r=>r.field===observation.field)?.label||rule.name,value:rule.id==='risk'?Math.abs(observation.value):observation.value,score:values[rule.id],display:rule.kind==='ratio'?'ratio':'percent',formula:rule.formula,source:observation.source,field:observation.field,date:observation.date,scope:observation.scope})}
 const dimensions=SIMPLE_DIMENSIONS.map(d=>{const item=metricScores.find(m=>m.dimension===d.id);return {...d,configuredWeight:d.weight,weight:d.id==='cost'?d.weight*(costs.coverage||0)/100:d.weight,score:values[d.id]??null,status:Number.isFinite(values[d.id])?'calculated':'unavailable',formula:formulas[d.id]||'',source:item?.source||null,scope:item?.scope||(d.id==='cost'?'固定费用统计':'净值路径复算'),basisKey:JSON.stringify(d.id==='cost'?costs.items.map(x=>[x.field,x.date]):item?.field?[item.field,results.find(r=>r.field===item.field)?.parameters,item.date]:[nav?.field,metrics?.startDate,metrics?.endDate,metrics?.periodsPerYear]),date:item?.date||metrics?.endDate||null}});
 const peerContext=officialPeerContext(results,units.performanceUnit);
 const decision=evaluateDecision(research,metrics,{...context,priceBasisOnly:unit&&template.distributions!=='none'},costs,results);
 const fieldUsage=results.filter(r=>r.status==='returned-unverified'&&r.series?.length).map(row=>{const direct=metricScores.filter(m=>m.field===row.field),derived=row.field===nav?.field?metricScores.filter(m=>!m.field&&m.dimension!=='cost'):[];const scored=[...new Set([...direct,...derived].map(m=>m.dimension))];if(row.group==='fees'&&costs.items.some(i=>i.field===row.field))scored.push('cost');return {field:row.field,label:row.label,role:scored.length?'score':'context',dimensions:[...new Set(scored)],explanation:scored.length?'用于维度评分':row.group==='assets'?'用于解释资产暴露，不按股债比例评安全等级':row.group==='fees'?'交易条件或费率信息；不与固定年费重复加总':row.group==='peers'?'提供方同类背景，不冒充统一样本排名':row.group==='rates'?'用于解释利率风险，不直接按大小评优劣':'补充核验指标；无统一单位或统计口径时不与净值计算混合'}});
 const assessment={name:product.name||product.code,modelVersion:SIMPLE_MODEL_VERSION,dimensions,compositeScore:null,warnings:reasons};
 const summary=scoreAvailableDimensions(assessment);if(metrics&&unit&&template.distributions!=='none')summary.notice='分红未核对，仅原始净值观察，不代表实际总收益。'+summary.notice;assessment.coverage=summary.coverage;assessment.partialScore=summary.score;
 const analysis=[];
 if(metrics)analysis.push(flat?`实际日期 ${metrics.startDate} 至 ${metrics.endDate}，${metrics.observations}条净值相同；本路径不生成收益风险高分。`:`实际净值区间 ${metrics.startDate} 至 ${metrics.endDate}，${metrics.observations}条观测，净值变化 ${(metrics.periodReturn*100).toFixed(2)}%，已观察最大回撤 ${(metrics.maxDrawdown*100).toFixed(2)}%。`);
 const nativeCount=metricScores.filter(m=>m.field).length;
 if(nativeCount)analysis.push(`${nativeCount}个维度使用iFinD统计值，保留提供方参数和数据日期；不冒充同区间净值复算。`);
 if(!metrics&&!nativeCount)analysis.push(Number.isFinite(costs.score)?'当前仅有已知费用的单项评分。':'没有足够可评分依据，保留有效原始读数。');

 return {assessment,metrics,metricScores,summary,reasons,analysis,costs,allocation,research,decision,peerContext,fieldUsage,navField:nav?.field||null,units};
}
export function classifiedGroups(results){return Object.entries(INVESTOR_GROUPS).map(([id,name])=>{const rows=results.filter(r=>r.group===id);return {id,name,valid:rows.filter(r=>r.series.length&&r.status==='returned-unverified').length,total:rows.length,items:rows}})}
export function emptyClassifiedRows(selectedGroups){return INVESTOR_INDICATORS.map(d=>({...d,status:selectedGroups.includes(d.group)?'not-tested':'not-selected',series:[],notice:selectedGroups.includes(d.group)?'尚未查询':'本次未选择此分类',score:null,scoreReason:'原值供分析参考；有有效净值时独立计算净值与费用维度，不把规模/久期简单按大小打分'}))}
