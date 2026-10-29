import {officialObservation} from './official-observations.js';
const DAY=86400000,round=v=>Math.round(v*100)/100;
export function validateDecisionProfile(input={}){
 if(!input||Array.isArray(input)||typeof input!=='object')throw Error('投资计划格式无效');
 const ranges={maxLossPercent:[0,100],plannedMonths:[1,600],positionPercent:[0,100],maxPositionPercent:[0,100],investmentAmount:[0,1e12]};
 if(Object.keys(input).some(k=>k!=='mode'&&!Object.hasOwn(ranges,k)))throw Error('投资计划包含未知字段');
 const result={mode:input.mode??'review'};if(!['review','held'].includes(result.mode))throw Error('请选择观察或已持有');
 for(const [key,[lo,hi]]of Object.entries(ranges)){if(input[key]===undefined||input[key]===null||input[key]==='')continue;const n=input[key];if(typeof n!=='number'||!Number.isFinite(n)||n<lo||n>hi)throw Error('投资计划数值超出范围');result[key]=n}
 return result;
}
function percentile(sorted,p){const i=(sorted.length-1)*p,a=Math.floor(i),b=Math.ceil(i);return sorted[a]+(sorted[b]-sorted[a])*(i-a)}
export function researchMetrics(metrics){
 if(!metrics||!metrics.regular||metrics.observations<20||metrics.elapsedDays<30)return null;
 const rows=metrics.rows;if(rows.every(r=>Math.abs(r.nav-rows[0].nav)<1e-10))return null;
 const returns=rows.slice(1).map((r,i)=>r.nav/rows[i].nav-1),downside=Math.sqrt(returns.reduce((s,r)=>s+Math.min(r,0)**2,0)/returns.length);
 let peak=rows[0].nav,peakDate=rows[0].date,underwaterDays=0,longestUnderwaterDays=0,recoveries=0,inDrawdown=false;const drawdowns=[];
 for(let i=0;i<rows.length;i++){
  const r=rows[i];if(i&&rows[i-1].nav<peak-1e-10)underwaterDays+=(Date.parse(r.date)-Date.parse(rows[i-1].date))/DAY;
  if(r.nav>=peak-1e-10){if(inDrawdown){longestUnderwaterDays=Math.max(longestUnderwaterDays,(Date.parse(r.date)-Date.parse(peakDate))/DAY);recoveries++}peak=r.nav;peakDate=r.date;inDrawdown=false}
  else{inDrawdown=true;longestUnderwaterDays=Math.max(longestUnderwaterDays,(Date.parse(r.date)-Date.parse(peakDate))/DAY)}
  drawdowns.push({date:r.date,value:Math.max(0,1-r.nav/peak)});
 }
 const last=rows.at(-1),currentDrawdown=Math.max(0,1-last.nav/peak),currentUnderwaterDays=currentDrawdown>1e-10?(Date.parse(last.date)-Date.parse(peakDate))/DAY:0;
 const windows=[30,90,365].flatMap(days=>{const cutoff=Date.parse(last.date)-days*DAY,first=rows.find(r=>Date.parse(r.date)>=cutoff),span=(Date.parse(last.date)-Date.parse(first.date))/DAY;if(span<days*.9)return [];return [{days,start:first.date,end:last.date,observedDays:span,return:last.nav/first.nav-1}]});
 const rolling=[];let j=0;
 for(let i=0;i<rows.length;i++){while(j+1<i&&Date.parse(rows[j+1].date)<=Date.parse(rows[i].date)-30*DAY)j++;const span=(Date.parse(rows[i].date)-Date.parse(rows[j].date))/DAY;if(span>=30&&span<=45)rolling.push(rows[i].nav/rows[j].nav-1)}
 const sorted=[...returns].sort((a,b)=>a-b),tailMass=sorted.length*.05,tailCount=Math.floor(tailMass),tailSum=sorted.slice(0,tailCount).reduce((s,r)=>s+r,0)+(tailMass-tailCount)*(sorted[tailCount]??0);
 return {windows,downsideDeviation:downside,currentDrawdown,currentUnderwaterDays,longestUnderwaterDays,underwaterFraction:Math.min(1,underwaterDays/metrics.elapsedDays),recoveries,drawdowns,rollingPositiveShare:rolling.length>=20?rolling.filter(r=>r>0).length/rolling.length:null,rollingSamples:rolling.length,historicalVar95:returns.length>=60?Math.max(0,-percentile(sorted,.05)):null,historicalES95:returns.length>=60?Math.max(0,-tailSum/tailMass):null,tailPeriod:metrics.sampling?.label||'每期',end:last.date};
}
export function evaluateDecision(research,metrics,context={},costs={},results=[]){
 const profile=validateDecisionProfile(context.decisionProfile||{}),checks=[];
 if(research&&!context.priceBasisOnly&&Number.isFinite(profile.maxLossPercent)){
  const exceeds=metrics.maxDrawdown*100>profile.maxLossPercent;
  checks.push({id:'risk-budget',level:exceeds?'attention':'aligned',title:exceeds?'历史回撤超过风险预算':'历史回撤在自设预算内',text:`历史最大回撤${round(metrics.maxDrawdown*100)}%，你的预算${profile.maxLossPercent}%。未来损失仍可能更大。`,action:exceeds?(profile.mode==='held'?'复核仓位与可承受损失，评估再平衡。':'先评估风险承受能力，再考虑新增。'):'继续检查持有期限、组合敞口和退出条件。'});
 }
 if(Number.isFinite(profile.positionPercent)&&Number.isFinite(profile.maxPositionPercent)){
  const exceeds=profile.positionPercent>profile.maxPositionPercent;checks.push({id:'position',level:exceeds?'attention':'aligned',title:exceeds?'持仓超过自设上限':'持仓在自设上限内',text:`当前占比${profile.positionPercent}%，上限${profile.maxPositionPercent}%。`,action:exceeds?'可评估分批再平衡，并先检查赎回费用和到账安排。':'仍需检查其他产品是否持有相同底层资产。'});
 }
 const quarter=research?.windows.find(w=>w.days===90);
 if(quarter)checks.push({id:'path',level:quarter.return<0&&research.currentDrawdown>0?'watch':'info',title:quarter.return<0?'近三个月表现承压':'近三个月净值增长',text:`区间变化${round(quarter.return*100)}%，当前较历史高点回落${round(research.currentDrawdown*100)}%。`,action:'结合业绩基准与投资策略解释变化，不仅凭涨跌追买或止损。'});
 if(Number.isFinite(profile.plannedMonths))checks.push({id:'horizon',level:profile.plannedMonths<3?'watch':'info',title:'持有期与退出安排',text:`计划持有${profile.plannedMonths}个月。`,action:'核对最短持有期、开放日、到账日和对应赎回费；单一赎回费字段不能证明随时可取。'});
 const redemption=officialObservation(results,'ths_redemptionfee_fund',{kind:'percent',unit:context.units?.rateUnit||'auto'});
 const scenario=research&&!context.priceBasisOnly&&Number.isFinite(profile.investmentAmount)?{amount:profile.investmentAmount,historicalDrawdownLoss:round(profile.investmentAmount*metrics.maxDrawdown),exitFeeAtSuppliedCondition:redemption&&redemption.value>=0?round(profile.investmentAmount*redemption.value):null,notice:'历史回撤重演情景，不是损失上限或预测；退出费仅对应接口所选条件，未含全部税费。'}:null;
 const attention=checks.some(c=>c.level==='attention');
 return {profile,checks,scenario,title:attention?'优先处理风险与仓位':research?'结合风险预算评估持有':'先补足判断依据',summary:attention?'风险或仓位已超过你设定的条件，综合分不能覆盖这一约束。':context.priceBasisOnly?'当前为单位净值路径，含分红实际收益另计；仓位和退出条件仍需单独评估。':research?'历史表现用于筛选；买入前还需匹配资金用途，持有或退出需结合仓位和退出成本。':'现有指标可供观察，暂不据此形成买卖时点结论。',exitFee:redemption,knownAnnualCost:costs.knownTotal??null,views:[{name:'新增资金',status:attention?'先处理约束':research?'进入同类比较':'依据不足',text:attention?'风险预算或仓位条件已触发，先处理这些约束。':'比较相同策略、风险、费用和持有期的替代产品，再决定是否配置。'},{name:'已有持仓',status:attention?'复核再平衡':research?'按计划跟踪':'核对持有依据',text:'结合仓位上限、风险预算与策略变化复核；不因短期下跌自动清仓。'},{name:'退出前',status:redemption?'核对费率条件':'检查赎回条款',text:'确认开放日、最短持有期、实际费率、到账时间和巨额赎回限制。'}]};
}
export function officialPeerContext(results,unit){
 const pairs=[['波动对比','ths_annual_volatility_fund','ths_similar_product_avg_annualvolatility_fund',2],['下行风险对比','ths_downside_risk_fund','ths_similar_product_avg_downside_risk_fund',3]];
 return pairs.flatMap(([name,ownField,peerField,n])=>{const own=officialObservation(results,ownField,{kind:'percent',unit}),peer=officialObservation(results,peerField,{kind:'percent',unit});if(!own||!peer||!Array.isArray(own.parameters)||!Array.isArray(peer.parameters)||own.date!==peer.date||JSON.stringify(own.parameters?.slice(0,n))!==JSON.stringify(peer.parameters?.slice(0,n)))return [];return [{name,own:Math.abs(own.value),peer:Math.abs(peer.value),date:own.date,sources:[own.source,peer.source],scope:'同花顺默认参数下的同类统计，不是本平台全市场排名'}]});
}
