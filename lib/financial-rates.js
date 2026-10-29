import {validateSource} from './assessment.js';
const units=new Set(['auto','percent','decimal']);
export function validateUnits(input={}){const rateUnit=input.rateUnit??'auto',allocationUnit=input.allocationUnit??'auto',performanceUnit=input.performanceUnit??'auto';if(!units.has(rateUnit)||!units.has(allocationUnit)||!units.has(performanceUnit))throw Error('请选择自动识别、百分数或小数单位');return {rateUnit,allocationUnit,performanceUnit}}
/** 只识别明确单位；纯数字不按大小猜百分数，零在两种单位下相同。 */
export function parseRate(value,unit='auto',maximum=1){
 if(!units.has(unit))return null;let number,explicit=false;
 if(typeof value==='string'){const text=value.trim();if(['免收','免费','不收取'].includes(text))return 0;const percent=text.match(/^(\d+(?:\.\d*)?|\.\d+)\s*[%％](?:\s*(?:\/年|每年|年))?$/);if(percent){number=Number(percent[1])/100;explicit=true}else if(/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))number=Number(text);else return null}
 else if(typeof value==='number'&&Number.isFinite(value))number=value;else return null;
 if(!explicit){if(number===0)return 0;if(unit==='auto')return null;if(unit==='percent')number/=100}
 return Number.isFinite(number)&&number>=0&&number<=maximum?number:null;
}
export function rateObservation(results,field,unit,maximum=1){const row=results.find(r=>r.field===field);if(row?.status!=='returned-unverified'||row.outsideRequestedRange||!validateSource(row.source)||!row.series?.length)return null;const last=row.series.at(-1),rate=parseRate(last.value,unit,maximum);return rate===null?null:{field,rate,date:last.date,raw:last.value,source:row.source,label:row.label}}
export function assessCosts(results,unit='auto'){
 const rules=[{field:'ths_manage_fee_rate_fund',weight:70,limit:.03},{field:'ths_mandate_fee_rate_fund',weight:20,limit:.005},{field:'ths_sales_service_fee_fund',weight:10,limit:.01}];
 const observations=rules.map(rule=>{const item=rateObservation(results,rule.field,unit);return item?{...item,...rule,score:Math.round(Math.max(0,Math.min(100,100*(1-item.rate/rule.limit)))*100)/100}:null}).filter(Boolean);
 if(!observations.length)return {score:null,coverage:0,items:[],notice:'没有单位明确的有效费率；纯数字可确认单位后用当前报告重算，不重新取数。'};
 const date=observations.map(i=>i.date).sort().at(-1),items=observations.filter(i=>i.date===date),coverage=items.reduce((s,i)=>s+i.weight,0),knownTotal=items.reduce((s,i)=>s+i.rate,0);
 if(knownTotal>1)return {score:null,coverage:0,items,notice:'合计费率范围异常，保留原值不评分。'};
 return {score:Math.round(items.reduce((s,i)=>s+i.score*i.weight,0)/coverage*100)/100,coverage,knownTotal,total:coverage===100?knownTotal:null,items,date,notice:`仅基于${items.length}/3项有效固定年费评分，费用子项权重覆盖${coverage}%。管理/托管/销售服务权重70/20/10，映射上限3%/0.5%/1%。缺项不当零；不含交易费和业绩报酬，也不从费后净值收益中再次扣费。`};
}
export function allocationObservations(results,unit='auto'){
 const fields=['ths_stock_mv_to_fanv_fund','ths_bond_mv_to_fanv_fund','ths_fund_mv_to_fanv_fund','ths_bank_deposit_to_fanv_fund'];const valid=fields.map(f=>rateObservation(results,f,unit,10)).filter(Boolean);if(!valid.length)return {items:[],notice:'没有单位明确的配置比例。'};
 const date=valid.map(i=>i.date).sort().at(-1),items=valid.filter(i=>i.date===date);return {items,date,notice:'仅展示同一数据日期、单位明确的净资产比例；数据日期不等于报告期或披露日。可能不是全部资产，合计可因杠杆超过100%，不强制归一化，也不评成安全等级。'};
}
