import { normalizeSeries } from './assessment.js';
// 严格 CSV 读取，支持 BOM、引号、换行、逗号；不执行文件内容或公式。
export function parseCSV(text){
 if(typeof text!=='string'||text.length>2_000_000)throw Error('CSV 不能超过 2 MB');
 const rows=[];let row=[],value='',quoted=false;
 const source=text.replace(/^\uFEFF/,'');
 for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){if(quoted&&source[i+1]==='"'){value+='"';i++}else if(!quoted&&value.length||quoted&&source[i+1]&&![',','\r','\n'].includes(source[i+1]))throw Error('CSV 引号格式不正确');else quoted=!quoted}else if(c===','&&!quoted){row.push(value);value=''}else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&source[i+1]==='\n')i++;row.push(value);if(row.some(x=>x.trim()))rows.push(row);row=[];value=''}else value+=c}
 if(quoted)throw Error('CSV 引号未闭合');row.push(value);if(row.some(x=>x.trim()))rows.push(row);if(rows.length<3)throw Error('CSV 需要表头和至少两行数据');
 const headers=rows.shift().map(s=>s.trim());if(new Set(headers).size!==headers.length)throw Error('CSV 表头不能重复');
 if(rows.some(r=>r.length!==headers.length))throw Error('CSV 行列数不一致');return {headers,rows};
}
export function csvSeries(parsed,dateColumn,navColumn){
 const di=parsed.headers.indexOf(dateColumn),ni=parsed.headers.indexOf(navColumn);if(di<0||ni<0||di===ni)throw Error('请分别选择日期列和净值列');
 return normalizeSeries(parsed.rows.map(r=>{const raw=r[ni].trim();if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw))throw Error('净值列存在空值、非数字或不支持的千位分隔；请清理后再导入');return {date:r[di].trim(),nav:Number(raw)}}));
}
/** iFinD 常见 tables/time/table 格式。不假设指标名称；由官方代码生成器选定。 */
export function ifindSeries(payload,field,code,{allowMissing=false}={}){
 if(!payload||Number(payload.errorcode)!==0)throw Error('iFinD 返回失败或缺少成功状态，请检查授权及查询参数');
 const tables=payload.tables||payload.data?.tables;if(!Array.isArray(tables))throw Error('未识别到 tables；请使用 CSV 导出或核对接口结构');
 const matches=tables.filter(t=>String(t.thscode||t.code)===code);if(matches.length!==1)throw Error('响应中的产品代码缺失或不唯一');
 const table=matches[0];const dates=table.time||table.date;const values=table.table?.[field];if(!Array.isArray(dates)||!Array.isArray(values)||dates.length!==values.length)throw Error('日期/指标列未识别或长度不同，请核对指标名称');
 let missingCount=0;const rows=dates.flatMap((date,i)=>{if(allowMissing&&(values[i]===null||values[i]===undefined||values[i]==='')){missingCount++;return []}return [{date,nav:values[i]}]});const result=normalizeSeries(rows);Object.defineProperty(result,'missingCount',{value:missingCount});return result;
}
