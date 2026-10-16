export const BANK_DRAWDOWN_FIELD='ths_max_retrace_rate_all_fund';
export function extraIndicators(payload,navField){
 const fields=(payload.indipara||[]).map(x=>x.indicator);
 return fields.filter(field=>field!==navField&&field===BANK_DRAWDOWN_FIELD).map(field=>({field,label:'iFinD 最大回撤率',unit:'unknown',window:'unknown',signConvention:'unknown',interpretation:'来自用户官方查询函数；统计窗口、单位、正负号尚未核对，不参与评分或同口径比较'}));
}
/** 风险指标不是净值：允许0和负数，不复权、不擅自乘100或取绝对值。 */
export function parseOfficialIndicators(payload,definitions,code,source){
 const tables=payload?.tables||payload?.data?.tables;const matches=Array.isArray(tables)?tables.filter(t=>String(t.thscode||t.code)===code):[];
 return definitions.map(def=>{const result={...def,source:{...source,title:`${code} · ${def.field} · 官方日期序列原始指标`},series:[],status:'unavailable',notice:'该字段未返回有效观测，未填0或代用净值回撤'};if(matches.length!==1)return result;const t=matches[0],dates=t.time||t.date,values=t.table?.[def.field];if(!Array.isArray(dates)||!Array.isArray(values)||dates.length!==values.length)return result;const seen=new Set();let missing=0;for(let i=0;i<dates.length;i++){const date=dates[i],value=values[i];if(value===null||value===undefined||value===''){missing++;continue}if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||seen.has(date)||typeof value!=='number'||!Number.isFinite(value))return {...result,notice:'指标日期、重复记录或数值格式异常，未解释或评分'};seen.add(date);result.series.push({date,value})}result.series.sort((a,b)=>a.date.localeCompare(b.date));return {...result,missingObservations:missing,status:result.series.length?'returned-unverified':'unavailable',notice:result.series.length?'官方接口原值；统计窗口、单位与正负号未确认，不自动计入评分':result.notice}});
}
