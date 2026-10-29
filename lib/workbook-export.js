import {CODE_PATTERN} from './catalog.js';
import {INVESTOR_INDICATORS} from './investor-indicators.js';
import {EXPORT_COLUMNS} from './export-columns.js';
function dateText(value){if(value instanceof Date){if(!Number.isFinite(value.getTime()))throw Error('导出日期无效');return value.toISOString().slice(0,10)}const m=typeof value==='string'&&value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?: 00:00:00)?$/);if(!m)throw Error('请保留Excel时间列或YYYY-MM-DD日期');const text=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');if(!Number.isFinite(Date.parse(text))||new Date(text).toISOString().slice(0,10)!==text)throw Error('导出日期无效');return text}
/** 只读取表格值；不执行单元格公式或文件中的指令。 */
export function workbookToInvestorData(rows){
 if(!Array.isArray(rows)||rows.length>2005)throw Error('每次导入最多2000条日期记录');
 const hi=rows.findIndex((r,i)=>i<10&&Array.isArray(r)&&r.some(v=>['时间','日期','time'].includes(v))&&r.some(v=>['代码','证券代码','产品代码','thscode'].includes(v)));if(hi<0)throw Error('未找到时间、代码表头，请导入超级命令结果表，不是产品目录');
 const headers=rows[hi].map(v=>String(v??'').trim()),di=headers.findIndex(h=>['时间','日期','time'].includes(h)),ci=headers.findIndex(h=>['代码','证券代码','产品代码','thscode'].includes(h)),columns=[];
 for(const def of INVESTOR_INDICATORS){const aliases=new Set([def.field,def.label,...(EXPORT_COLUMNS[def.field]||[])]),indices=headers.flatMap((h,i)=>aliases.has(h)?[i]:[]);if(indices.length>1)throw Error('同一指标有重复列：'+def.label);if(indices.length)columns.push({field:def.field,index:indices[0]})}
 if(!columns.length)throw Error('文件中没有可识别的净值、费率或配置字段');
 const records=[],codes=new Set(),seen=new Set();
 for(const row of rows.slice(hi+1)){if(!row.some(v=>v!==null&&v!==undefined&&v!==''))continue;if(row.some(v=>v==='数据来源：同花顺iFinD')&&!row[ci]&&!row[di])continue;const code=row[ci];if(typeof code!=='string'||!CODE_PATTERN.test(code))throw Error('导出表存在无效产品代码');const date=dateText(row[di]);codes.add(code);if(seen.has(date))throw Error('请每次导入一只产品，且同一日期只保留一条记录');seen.add(date);records.push({date,row})}
 if(codes.size!==1||!records.length)throw Error('请每次导入一只产品的有效数据');records.sort((a,b)=>a.date.localeCompare(b.date));
 return {code:[...codes][0],time:records.map(r=>r.date),table:Object.fromEntries(columns.map(c=>[c.field,records.map(r=>r.row[c.index]??null)])),sourceColumnCount:headers.filter((h,i)=>h&&i!==di&&i!==ci&&!['序号','number','index'].includes(h)).length};
}
export async function readInvestorWorkbook(file){
 if(!file||!file.size||file.size>10*1024*1024)throw Error('请选择10MB以内的超级命令XLSX结果文件');
 const bytes=await file.arrayBuffer();if(new Uint8Array(bytes)[0]!==0x50||new Uint8Array(bytes)[1]!==0x4b)throw Error('请选择实际的XLSX工作簿，不要只改文件后缀');
 const {default:readXlsx}=await import('read-excel-file/browser');const sheets=await readXlsx(file);if(sheets.length!==1)throw Error('请只保留需要分析的一张结果表');const data=workbookToInvestorData(sheets[0].data);const digest=await crypto.subtle.digest('SHA-256',bytes);return {...data,filename:file.name,fileHash:[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')};
}
