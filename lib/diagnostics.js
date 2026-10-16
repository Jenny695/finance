import { normalizeSeries } from './assessment.js';
const DAY=86400000;
const time=s=>Date.parse(s+'T00:00:00Z');
const ratio=(a,b)=>b?Math.round(a/b*10000)/100:null;
/** 诊断观测值的适用范围，不把数据质量当作投资安全度。 */
export function diagnoseSeries(input,{navBasis='unit',distributions='unknown',source=null,periodsPerYear=252,now=new Date().toISOString().slice(0,10),requestedStart,requestedEnd,missingObservations=0}={}){
 const rows=normalizeSeries(input);const first=rows[0],last=rows.at(-1);const values=rows.map(r=>r.nav),min=Math.min(...values),max=Math.max(...values);const flat=(max-min)/min<1e-10;
 const flatUnit=flat&&navBasis==='unit';let unchanged=0,positive=0,negative=0,longest=1,run=1,maxGap=0;
 const gaps=[];const drawdown=[];let peak=first.nav;const monthMap=new Map();
 rows.forEach((r,i)=>{peak=Math.max(peak,r.nav);drawdown.push({date:r.date,value:r.nav/peak-1});const month=r.date.slice(0,7);if(!monthMap.has(month))monthMap.set(month,{month,observations:0,first:r.nav,last:r.nav,firstDate:r.date,lastDate:r.date});const item=monthMap.get(month);item.observations++;item.last=r.nav;item.lastDate=r.date;
  if(i){const change=r.nav/rows[i-1].nav-1;const gap=(time(r.date)-time(rows[i-1].date))/DAY;maxGap=Math.max(maxGap,gap);gaps.push({from:rows[i-1].date,to:r.date,calendarDays:gap});if(Math.abs(change)<1e-10){unchanged++;run++;longest=Math.max(longest,run)}else{run=1;change>0?positive++:negative++}}});
 const months=[...monthMap.values()];months.forEach((m,i)=>{const baseline=i?months[i-1].last:m.first;m.navChange=m.last/baseline-1;m.partial=i===0||i===months.length-1});
 let calendarDays=0,weekdays=0;for(let t=time(first.date);t<=time(last.date);t+=DAY){calendarDays++;if(![0,6].includes(new Date(t).getUTCDay()))weekdays++}
 const expected=periodsPerYear===365?calendarDays:periodsPerYear===252?weekdays:Math.max(2,Math.round((calendarDays-1)/(periodsPerYear===52?7:30.4375))+1);
 const uniqueValues=new Set(values.map(v=>v.toPrecision(12))).size;
 const freshnessDays=Math.max(0,Math.floor((time(now)-time(last.date))/DAY));
 const missing=Number.isInteger(missingObservations)&&missingObservations>=0?missingObservations:0;
 const issues=[];
 if(flatUnit)issues.push({severity:'warning',code:'flat-unit',title:'单位净值恒定，收益信息不完整',detail:'观察到净值长期不变。可能涉及按份额结转/收益分配、指标适用性或数据更新等原因；不能仅凭该序列判定零收益、零风险，也不能由此确认产品类型。'});
 if(distributions==='unknown'&&navBasis==='unit')issues.push({severity:'warning',code:'income-unknown',title:'分红与收益分配尚未核对',detail:'需取得万份收益、收益分配流水或经确认的总回报净值。不会把七日年化收益率当作已实现收益累加。'});
 if(maxGap>7)issues.push({severity:'info',code:'long-gap',title:'存在超过7个自然日的观测间隔',detail:'可能来自节假日、披露频率或缺失记录，需按产品原文核对，不自动插值。'});
 if(freshnessDays>7)issues.push({severity:'warning',code:'stale',title:`最新观测距今${freshnessDays}天`,detail:'请检查请求区间、产品是否存续及数据更新。'});
 const outside=rows.filter(r=>(requestedStart&&r.date<requestedStart)||(requestedEnd&&r.date>requestedEnd)).length;
 if(outside)issues.push({severity:'warning',code:'out-of-range',title:`有${outside}条观测在请求区间外`,detail:'原始响应区间与请求不一致，应核对上游日期口径。'});
 return {version:'data-diagnostics-1.0',flat,flatUnit,uniqueValues,observations:rows.length,firstDate:first.date,lastDate:last.date,minNav:min,maxNav:max,observedChange:last.nav/first.nav-1,observedDrawdown:Math.min(...drawdown.map(r=>r.value)),freshnessDays,missingObservations:missing,unchangedIntervals:unchanged,longestUnchangedRun:longest,intervals:{positive,negative,unchanged},maxGapDays:maxGap,gaps:gaps.filter(g=>g.calendarDays>7),months,drawdown,coverage:{observed:rows.length,expected,percent:ratio(rows.length,expected),label:periodsPerYear===252?'工作日期数近似（未扣除法定节假日）':'按所选频率估算，非完整性审计',nonEmptyPercent:ratio(rows.length,rows.length+missing)},returnInterpretation:flatUnit?'不适合用单位净值代表总回报':'净值变化不一定包含收益分配，须核对口径',source,issues};
}
/** 每个读数都可回到原始数据；对缺资料只做准备度统计，不充当理财评级。 */
export function evidenceReadiness({product={},source,diagnostics,evidence={},incomeSeries=null}={}){
 const checks=[
 {id:'nav',name:'净值序列',available:!!diagnostics?.observations,detail:'已取得带日期的净值观测'},
 {id:'identity',name:'产品身份',available:!!product.registrationCode,detail:'需全国理财登记编码与名称匹配'},
 {id:'return',name:'总回报口径',available:!!incomeSeries||(!!diagnostics&&!diagnostics.flatUnit&&product.returnBasisVerified===true),detail:'恒定单位净值需另核对收益分配或总回报序列'},
 {id:'risk',name:'风险与类型',available:!!product.type&&!!(product.riskLabel||product.riskLevel),detail:'须有原文支持，不从名称推测'},
 {id:'assets',name:'资产报告',available:!!evidence.assets?.confirmed,detail:'报告期和资产比例必须有原文'},
 {id:'liquidity',name:'赎回规则',available:!!evidence.liquidity?.confirmed,detail:'开放时间、持有期、到账规则'},
 {id:'fees',name:'费用条款',available:!!evidence.fees?.confirmed,detail:'管理费、托管费、销售费等原文'},
 {id:'peer',name:'同类样本',available:false,detail:'至少5只严格同口径产品，未自动构造排名'}];
 const count=checks.filter(c=>c.available).length;return {checks,count,total:checks.length,percent:ratio(count,checks.length),label:'资料准备度，非投资评分'};
}
