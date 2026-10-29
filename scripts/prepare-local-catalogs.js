// 从用户电脑原始目录生成私有离线包；不联网，不读取登录凭据。
import {readFile,readdir,mkdir,writeFile,rename,rm} from 'node:fs/promises';
import {resolve,dirname,extname,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import readXlsxFile from 'read-excel-file/node';
import {inspectCSVFile} from '../lib/csv-file.js';
import {streamCSV,CATALOG_COLUMNS} from '../lib/stream-csv.js';
import {productRecord} from '../lib/catalog.js';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const definitions={'银行理财产品(存续期)':{file:'bank.csv',category:'bank'},'全部(信托产品)':{file:'trust.csv',category:'trust'},'全部(已成立、未到期)':{file:'unexpired.csv',category:'broker'},'全部基金':{file:'funds.csv',category:'fund'}};
const digest=b=>createHash('sha256').update(b).digest('hex');
export function catalogRecords(rows,category){
 const headers=rows[0]?.map(v=>String(v??'').trim())||[];const ci=headers.findIndex(h=>CATALOG_COLUMNS.code.includes(h)),ni=headers.findIndex(h=>CATALOG_COLUMNS.name.includes(h));
 if(ci<0||ni<0)throw Error('目录缺少证券代码/证券名称表头');const records=[],seen=new Set();let skipped=0;
 for(const row of rows.slice(1)){if(row.every(v=>v===null||v===undefined||v==='')){skipped++;continue}const code=row[ci],name=row[ni];if(code==='数据来源：同花顺iFinD'&&!name){skipped++;continue}const p={code,name,category};productRecord(p);if(seen.has(code))throw Error('重复产品代码：'+code);seen.add(code);records.push(p)}
 if(!records.length)throw Error('目录没有有效产品');return {records,skipped};
}
async function readRows(bytes,name){
 if(bytes.length>100*1024*1024)throw Error(name+'超过100MB');
 if(bytes[0]===0x50&&bytes[1]===0x4b){const sheets=await readXlsxFile(bytes);if(sheets.length!==1)throw Error(name+'含多个工作表，请先保留产品目录工作表');return sheets[0].data}
 const file=new File([bytes],name),format=await inspectCSVFile(file),rows=[];for await(const row of streamCSV(file.stream(),format))rows.push(row);return rows;
}
const csv=records=>'\uFEFFcode,name\r\n'+records.map(p=>[p.code,p.name].map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
export async function prepareLocalCatalogs({root=project,onProgress=()=>{}}={}){
 const incoming=resolve(root,'import-files'),output=resolve(root,'.local/imports');let files;
 try{files=await readdir(incoming)}catch(error){if(error.code==='ENOENT')return {prepared:false};throw error}
 const chosen=files.filter(n=>['.csv','.xlsx'].includes(extname(n).toLowerCase())&&(definitions[n.slice(0,-extname(n).length)]||n.slice(0,-extname(n).length)==='公募REITs')).sort();
 if(!chosen.length)return {prepared:false};const inputs=[];for(const name of chosen)inputs.push({name,bytes:await readFile(resolve(incoming,name))});
 const fingerprint=digest('catalog-classes-3:'+JSON.stringify(inputs.map(x=>[x.name,digest(x.bytes)])));let manifest;
 try{manifest=JSON.parse(await readFile(resolve(output,'manifest.json'),'utf8'))}catch(error){if(error.code!=='ENOENT')throw error;manifest={version:1,files:[],removeProducts:[]}}
 if(manifest.preparationFingerprint===fingerprint)return {prepared:false,reused:true,total:manifest.total};
 const staged=new Map(),parsed=[],targets=new Set(),warnings=[];let newFunds=null,oldREITs=null;
 const warn=message=>{warnings.push(message);onProgress(message)};
 for(const input of inputs){const stem=input.name.slice(0,-extname(input.name).length);onProgress('正在读取 '+input.name+'…');const rows=await readRows(input.bytes,input.name);
  if(stem==='公募REITs'){oldREITs=catalogRecords(rows,'fund').records;continue}
  const definition=definitions[stem];if(targets.has(definition.file))throw Error('同一类目录同时有CSV和XLSX，请只保留一份：'+stem);targets.add(definition.file);
  const {records,skipped}=catalogRecords(rows,definition.category);
  parsed.push({definition,records,metadata:{originalFile:input.name,originalSha256:digest(input.bytes),skippedRows:skipped}});
  if(definition.file==='funds.csv')newFunds=new Set(records.map(r=>r.code));
 }
 if(!parsed.length)throw Error('公募REITs只用于替换核对，请放入全部基金.xlsx及其他要导入的目录');
 const unexpired=parsed.find(p=>p.definition.file==='unexpired.csv');
 if(unexpired)targets.add('unexpired-unclassified.csv');
 const retained=manifest.files.filter(f=>!targets.has(f.file)&&!(newFunds&&f.file==='reits.csv'));
 function stageRecords(file,category,records,metadata){if(!records.length)return;const text=csv(records);staged.set(file,{text,item:{file,category,rows:records.length,sha256:digest(Buffer.from(text)),...metadata}})}
 // 明确标注的基金/银行/信托目录优先；混合的“已成立未到期”不覆盖这些分类。
 const explicitCodes=new Map();
 for(const p of parsed.filter(p=>p!==unexpired)){
  for(const record of p.records)explicitCodes.set(record.code,record.name);
  stageRecords(p.definition.file,p.definition.category,p.records,p.metadata);
 }
 if(unexpired){
  for(const item of retained){
   if(typeof item.file!=='string'||basename(item.file)!==item.file||/[\\/]/.test(item.file)||!item.file.endsWith('.csv'))throw Error('已有目录文件路径无效');
   const {records}=catalogRecords(await readRows(await readFile(resolve(output,item.file)),item.file),item.category);
   for(const record of records)explicitCodes.set(record.code,record.name);
  }
  const broker=[],pending=[];let overlap=0,nameConflicts=0;
  for(const record of unexpired.records){
   if(explicitCodes.has(record.code)){overlap++;if(explicitCodes.get(record.code)!==record.name)nameConflicts++;continue}
   if(/^J[A-Z0-9_-]*\.OF$/.test(record.code))broker.push(record);
   else pending.push({...record,category:'other'});
  }
  stageRecords('unexpired.csv','broker',broker,{...unexpired.metadata,classification:'原目录中的已识别J类券商代码，未将其他代码直接认定为券商'});
  stageRecords('unexpired-unclassified.csv','other',pending,{...unexpired.metadata,classification:'原目录中类别尚未确认的产品；保留代码名称，不阻断其他目录导入'});
  if(pending.length)warn(`分类提示：已成立未到期目录中 ${broker.length} 条归券商资管，${pending.length} 条类别待确认，先保留到其他资管；继续导入，不删除产品。`);
  if(overlap)warn(`去重提示：${overlap} 条代码已在明确类别目录中，保留明确目录的分类和名称，不重复计数。${nameConflicts?'其中 '+nameConflicts+' 条名称不同，请日后核对原文件。':''}`);
 }
 if(newFunds&&!oldREITs&&manifest.files.some(f=>f.file==='reits.csv'))oldREITs=catalogRecords(await readRows(await readFile(resolve(output,'reits.csv')),'reits.csv'),'fund').records;
 const removals=new Map((manifest.removeProducts||[]).map(r=>[r.code,r]));
 if(newFunds){for(const code of newFunds)removals.delete(code);for(const record of oldREITs||[])if(!newFunds.has(record.code))removals.set(record.code,record)}
 const next={...manifest,version:1,preparedAt:new Date().toISOString(),source:'用户本机iFinD导出目录；仅代码名称，不代表行情已同步',files:[...retained,...[...staged.values()].map(v=>v.item)],removeProducts:[...removals.values()],warnings,preparationFingerprint:fingerprint};next.total=next.files.reduce((sum,f)=>sum+f.rows,0);
 await mkdir(output,{recursive:true});const stage=resolve(root,'.local','catalog-stage-'+randomUUID());await mkdir(stage);
 try{for(const [name,v]of staged)await writeFile(resolve(stage,name),v.text,'utf8');await writeFile(resolve(stage,'manifest.json'),JSON.stringify(next,null,2),'utf8');for(const name of staged.keys())await rename(resolve(stage,name),resolve(output,name));await rename(resolve(stage,'manifest.json'),resolve(output,'manifest.json'))}finally{await rm(stage,{recursive:true,force:true})}
 onProgress('目录准备完成，共 '+next.total+' 条；下一步校验、备份并导入。');return {prepared:true,total:next.total};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)prepareLocalCatalogs({onProgress:console.log}).catch(error=>{console.error(error.message);process.exitCode=1});
