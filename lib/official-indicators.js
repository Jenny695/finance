import {suppliedIndicator} from './indicator-catalog.js';
export const BANK_DRAWDOWN_FIELD='ths_max_retrace_rate_all_fund';
export function extraIndicators(payload,navField){
 return (payload.indipara||[]).flatMap(item=>{const def=suppliedIndicator(item.indicator);return def&&def.field!==navField?[{...def,parameters:item.indiparams||def.parameters}]:[]});
}
/** 风险/披露不是净值：保留数值正负号及文本等级；未知结构不强行转换。 */
export function parseOfficialIndicators(payload,definitions,code,source){
 const tables=payload?.tables||payload?.data?.tables;const matches=Array.isArray(tables)?tables.filter(t=>String(t.thscode||t.code)===code):[];
 return definitions.map(def=>{
  const result={...def,source:{...source,title:`${code} · ${def.field} · 官方日期序列原始指标`},series:[],status:'unavailable',notice:'该字段未返回有效观测，未填0或使用平台计算值替代'};
  if(matches.length!==1)return {...result,notice:'响应未能唯一匹配当前产品代码'};
  const t=matches[0],dates=t.time||t.date,values=t.table?.[def.field];
  if(values===undefined)return result;
  if(!Array.isArray(dates)||!Array.isArray(values)||dates.length!==values.length)return {...result,status:'invalid-data',notice:'日期与指标长度不一致，不纳入分析'};
  const seen=new Set(),series=[];let missing=0;
  for(let i=0;i<dates.length;i++){
   const date=dates[i],value=values[i];if(value===null||value===undefined||value===''){missing++;continue}
   if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||seen.has(date))return {...result,status:'invalid-data',notice:'日期或重复记录异常，整列隔离，不保留部分有效前缀'};
   if(value!==null&&typeof value==='object')return {...result,status:'unsupported-shape',notice:'返回结构化数据，需专用解析；未将对象或数组转换为数值'};
   const numeric=typeof value==='number'&&Number.isFinite(value);
   const text=def.valueType==='scalar'&&typeof value==='string'&&value.trim().length>0&&value.length<=300;
   if((!numeric&&!text)||(def.field==='ths_unit_nv_fund'&&(!numeric||value<=0)))return {...result,status:'invalid-data',notice:'指标类型或净值范围异常，整列隔离，不强行转换'};
   seen.add(date);series.push({date,value});
  }
  series.sort((a,b)=>a.date.localeCompare(b.date));return {...result,series,missingObservations:missing,status:series.length?'returned-unverified':'unavailable',notice:series.length?'官方接口原值；单位、参数语义、统计窗口和披露日期仍需确认，不自动评分':result.notice};
 });
}
