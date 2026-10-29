// 本机离线导入；不读取Token、不调用iFinD，上传目录与数据库都保留在.local内。
import {createReadStream} from 'node:fs';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,dirname,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {streamCSV} from '../lib/stream-csv.js';
import {productRecord,CATEGORIES} from '../lib/catalog.js';
import {createProductService} from '../server/product-service.js';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
async function hash(file){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex')}
async function* records(path,category){let header=true,count=0;for await(const row of streamCSV(createReadStream(path))){if(header){header=false;if(row.length!==2||row[0]!=='code'||row[1]!=='name')throw Error('目录表头必须为code,name');continue}if(row.length!==2)throw Error('目录列数错误');count++;if(count>1_000_000)throw Error('单文件超过100万条');yield {code:row[0],name:row[1],category}}if(header)throw Error('目录为空')}
export async function importCatalogBundle({folder=resolve(project,'.local'),onProgress=()=>{}}={}){
 folder=resolve(folder);const input=resolve(folder,'imports');const manifest=JSON.parse(await readFile(resolve(input,'manifest.json'),'utf8'));
 if(manifest.version!==1||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>100)throw Error('目录清单格式错误');
 const codes=new Set();let total=0;
 // 先检查全部文件和所有行，校验成功后才备份、写库；不以有效前缀冒充完整目录。
 for(const item of manifest.files){
  if(typeof item.file!=='string'||basename(item.file)!==item.file||/[\\/]/.test(item.file)||!item.file.endsWith('.csv')||!CATEGORIES[item.category]||!Number.isSafeInteger(item.rows)||item.rows<1||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('目录文件清单无效');
  const path=resolve(input,item.file);if(await hash(path)!==item.sha256)throw Error(item.file+'校验不符，未导入任何文件');
  const migrateBroker=item.category==='other'&&item.file==='unexpired.csv'&&/^全部\(已成立、未到期\)\.(csv|xlsx)$/i.test(item.originalFile||'');let onlyBroker=true;let n=0;for await(const record of records(path,item.category)){productRecord(record);if(!/^J[A-Z0-9_-]*\.OF$/.test(record.code))onlyBroker=false;if(codes.has(record.code))throw Error('目录重复代码：'+record.code);codes.add(record.code);n++}
  if(n!==item.rows)throw Error(item.file+'行数与清单不一致');total+=n;if(migrateBroker&&onlyBroker)item.category='broker';
 }
 if(total!==manifest.total)throw Error('目录总条数与清单不一致');
 const removals=manifest.removeProducts??[];
 if(!Array.isArray(removals)||removals.length>10000)throw Error('替换目录删除清单无效');
 const removalCodes=new Set();for(const record of removals){productRecord(record);if(codes.has(record.code)||removalCodes.has(record.code))throw Error('删除清单与新目录冲突或重复');removalCodes.add(record.code)}
 let backup=null;const database=resolve(folder,'finance.sqlite');let exists=true;try{await access(database)}catch(error){if(error.code!=='ENOENT')throw error;exists=false}
 if(exists){await mkdir(resolve(folder,'backups'),{recursive:true});backup=resolve(folder,'backups','before-catalog-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');const db=new DatabaseSync(database,{readOnly:true});try{db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'")}finally{db.close()}}
 const service=createProductService({folder});let imported=0;
 const previous=exists?new DatabaseSync(database,{readOnly:true}):null;
 const previousProduct=previous?.prepare('SELECT data FROM products WHERE code=?');
 try{
  for(const item of manifest.files){const path=resolve(input,item.file);if(await hash(path)!==item.sha256)throw Error('文件在检查后发生改变，后续导入停止');let batch=[];const flush=async()=>{if(!batch.length)return;await service.importCatalog(batch);imported+=batch.length;batch=[]};for await(const record of records(path,item.category)){const old=previousProduct?.get(record.code);if(old){const known=JSON.parse(old.data);for(const key of ['issuer','type','riskLevel','currency','source'])if(known[key])record[key]=known[key];if(record.category==='other'&&known.category!=='other')record.category=known.category}batch.push(record);if(batch.length===1000)await flush()}await flush();onProgress({file:item.file,rows:item.rows,imported,total})}
  let removed=0;
  if(removals.length){const writer=new DatabaseSync(database);try{writer.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');const lookup=writer.prepare('SELECT name,category FROM products WHERE code=?'),del=writer.prepare('DELETE FROM products WHERE code=?');for(const record of removals){const existing=lookup.get(record.code);if(!existing)continue;if(existing.name!==record.name||existing.category!==record.category)throw Error('旧目录产品已被修改，停止删除：'+record.code);removed+=Number(del.run(record.code).changes)}writer.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('catalog_revision',randomUUID());writer.exec('COMMIT')}catch(error){writer.exec('ROLLBACK');throw error}finally{writer.close()}}
  return {imported,removed,totalProducts:(await service.status()).products,backup,networkRequests:0};
 }catch(error){throw Error(`已提交${imported}条；已提交批次保留，可修正后重导：${error.message}`)}finally{previous?.close();service.close()}
}
async function main(){
 if(process.argv.length>3||process.argv[2]&&process.argv[2]!=='--if-needed')throw Error('仅支持可选参数--if-needed');
 const folder=resolve(project,'.local'),receipt=resolve(folder,'imports/installed.json'),manifest=resolve(folder,'imports/manifest.json');
 const fingerprint=createHash('sha256').update('catalog-classes-3:'+await hash(manifest)).digest('hex');
 if(process.argv[2]==='--if-needed'){
  try{const previous=JSON.parse(await readFile(receipt,'utf8'));await access(resolve(folder,'finance.sqlite'));if(previous.fingerprint===fingerprint){console.log('本批目录已经导入，保留现有数据库。');return}}catch(error){if(!['ENOENT','SyntaxError'].includes(error.code||error.name))throw error}
 }
 const result=await importCatalogBundle({onProgress:p=>console.log(`${p.file}: ${p.rows} 条，进度 ${p.imported}/${p.total}`)});
 await writeFile(receipt,JSON.stringify({fingerprint,imported:result.imported,installedAt:new Date().toISOString()},null,2),'utf8');
 console.log(JSON.stringify(result,null,2));console.log('目录导入完成。启动网页后，在“产品综合查询”搜索名称或代码。净值和指标仍需授权查询。');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){main().catch(error=>{console.error(error.message);process.exitCode=1})}
