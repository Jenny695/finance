import {validateSource} from './assessment.js';
export function scalarNumber(value){
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value==='string'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))return Number(value);
 return null;
}
/** Ratios are dimensionless. Percent statistics require explicit units, never a magnitude guess. */
export function officialObservation(results,field,{kind='ratio',unit='auto'}={}){
 const row=results.find(r=>r.field===field);
 if(row?.status!=='returned-unverified'||row.outsideRequestedRange||!validateSource(row.source)||!row.series?.length)return null;
 const item=row.series.at(-1);let value;
 if(kind==='percent'){
  if(typeof item.value==='string'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*[%％]$/.test(item.value.trim()))value=Number(item.value.replace(/[%％]/,''))/100;
  else{value=scalarNumber(item.value);if(value===null)return null;if(value!==0&&unit==='auto')return null;if(unit==='percent')value/=100}
 }else value=scalarNumber(item.value);
 return Number.isFinite(value)?{field,value,raw:item.value,date:item.date,source:row.source,scope:'iFinD默认参数统计值',parameters:row.parameters}:null;
}
