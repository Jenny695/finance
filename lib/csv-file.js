const ENCODINGS={'auto':'auto','utf8':'utf-8','utf-8':'utf-8','gbk':'gb18030','gb2312':'gb18030','cp936':'gb18030','gb18030':'gb18030','utf16le':'utf-16le','utf-16le':'utf-16le','utf16be':'utf-16be','utf-16be':'utf-16be'};
export const CSV_ENCODINGS=[['auto','自动识别（推荐）'],['utf-8','UTF-8'],['gb18030','GBK / GB18030（Windows中文CSV）'],['utf-16le','UTF-16 LE'],['utf-16be','UTF-16 BE']];
export function csvEncoding(value='utf-8'){const encoding=ENCODINGS[String(value).toLowerCase()];if(!encoding||encoding==='auto')throw Error('请选择UTF-8、GBK/GB18030或UTF-16编码');return encoding}
export function csvDecoder(encoding){try{return new TextDecoder(csvEncoding(encoding),{fatal:true})}catch{throw Error('当前浏览器不支持所选编码，请用Excel另存为“CSV UTF-8（逗号分隔）”后重试')}}
export function csvDecodeError(encoding){return Error(`文件内容与${encoding}编码不匹配。请选择“自动识别”或正确编码；也可用Excel另存为“CSV UTF-8（逗号分隔）”。`)}
function workbookSignature(bytes){return (bytes[0]===0x50&&bytes[1]===0x4b&&[0x03,0x05,0x07].includes(bytes[2]))||(bytes[0]===0xd0&&bytes[1]===0xcf&&bytes[2]===0x11&&bytes[3]===0xe0)}
function bomEncoding(b){if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)return 'utf-8';if(b[0]===0xff&&b[1]===0xfe)return 'utf-16le';if(b[0]===0xfe&&b[1]===0xff)return 'utf-16be';return null}
function unicodeHint(b){const n=Math.min(b.length,4096);let even=0,odd=0;for(let i=0;i<n;i++)if(b[i]===0){i%2?odd++:even++}if(n>=8&&odd/(n/2)>.3&&even/(n/2)<.05)return 'utf-16le';if(n>=8&&even/(n/2)>.3&&odd/(n/2)<.05)return 'utf-16be';return null}
async function validateEncoding(file,encoding){const decoder=csvDecoder(encoding);for await(const chunk of file.stream()){const text=decoder.decode(chunk,{stream:true});if(text.includes('\0'))throw Error('文本中含有二进制空字节')}const tail=decoder.decode();if(tail.includes('\0'))throw Error('文本中含有二进制空字节')}
export function detectCSVDelimiter(text){
 const counts={',':0,'\t':0,';':0};let quoted=false,started=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){i++;continue}quoted=!quoted;started=true;continue}if(!quoted&&(c==='\r'||c==='\n')){if(started)break;continue}if(!quoted&&c in counts)counts[c]++;if(c.trim())started=true}
 return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
}
/** 在任何批次写库之前全文件严格检查编码，避免ASCII表头误判后半段中文导致半途乱码。 */
export async function inspectCSVFile(file,{encoding='auto',delimiter='auto'}={}){
 if(!file||!file.size)throw Error('文件为空，请重新导出产品目录CSV');
 if(file.size>100*1024*1024)throw Error('单文件最多100MB，请分批导出');
 const prefix=new Uint8Array(await file.slice(0,65536).arrayBuffer());
 if(workbookSignature(prefix))throw Error('检测到Excel工作簿或压缩文件，并非文本CSV。请用Excel另存为“CSV UTF-8（逗号分隔）”，或先解压取得CSV；仅修改扩展名无效。');
 const bom=bomEncoding(prefix);let selected;
 if(encoding!=='auto'){
  selected=csvEncoding(encoding);if(bom&&bom!==selected)throw Error(`文件标记为${bom}，与所选${selected}不一致，请选择自动识别。`);
  try{await validateEncoding(file,selected)}catch{throw csvDecodeError(selected)}
 }else{
  const candidates=bom?[bom]:unicodeHint(prefix)?[unicodeHint(prefix)]:['utf-8','gb18030'];
  for(const candidate of candidates){try{await validateEncoding(file,candidate);selected=candidate;break}catch{}}
  if(!selected)throw Error('无法按UTF-8、GBK/GB18030或UTF-16正确读取文件。请用Excel打开后另存为“CSV UTF-8（逗号分隔）”，不要仅改后缀。');
 }
 const sample=csvDecoder(selected).decode(prefix,{stream:true}).replace(/^\uFEFF/,'');
 if(/^\s*(?:<!doctype\s+html|<html\b|<table\b|<\?xml)/i.test(sample))throw Error('检测到HTML/XML表格，不是CSV。请用Excel打开并另存为“CSV UTF-8（逗号分隔）”。');
 const separator=delimiter==='auto'?detectCSVDelimiter(sample):delimiter;if(![',','\t',';'].includes(separator))throw Error('仅支持逗号、制表符或分号分隔');
 return {encoding:selected,delimiter:separator,label:`${selected} · ${separator==='\t'?'制表符':separator===';'?'分号':'逗号'}分隔`};
}
