import {csvDecoder,csvDecodeError} from './csv-file.js';
// 流式文本CSV：跨块的引号、转义、CRLF、引号内换行及多字节编码均保留。
export async function* streamCSV(chunks,{encoding='utf-8',delimiter=','}={}){
 if(![',','\t',';'].includes(delimiter))throw Error('CSV分隔符无效');
 const decoder=csvDecoder(encoding);let field='',row=[],quoted=false,closed=false,skipLF=false,first=true;
 const append=c=>{field+=c;if(field.length>5000)throw Error('CSV单字段超过5000字')};
 function take(c){
  if(first){first=false;if(c==='\uFEFF')return}if(skipLF){skipLF=false;if(c==='\n')return}
  if(quoted){if(c==='"'){quoted=false;closed=true}else append(c);return}
  if(closed&&c==='"'){append('"');quoted=true;closed=false;return}
  if(c==='"'){if(field||closed)throw Error('CSV引号格式无效');quoted=true;return}
  if(c===delimiter||c==='\n'||c==='\r'){row.push(field);field='';closed=false;if(row.length>100)throw Error('CSV列数超过100');if(c!==delimiter){const done=row;row=[];if(c==='\r')skipLF=true;return done.some(v=>v.trim())?done:null}return}
  if(closed)throw Error('CSV引号后存在无效字符');append(c);
 }
 function decode(chunk,final=false){try{return final?decoder.decode():decoder.decode(chunk,{stream:true})}catch{throw csvDecodeError(encoding)}}
 for await(const chunk of chunks){const text=typeof chunk==='string'?chunk:decode(chunk);for(const c of text){const result=take(c);if(result)yield result}}
 for(const c of decode(undefined,true)){const result=take(c);if(result)yield result}if(quoted)throw Error('CSV引号未闭合');if(field||row.length||closed){row.push(field);if(row.some(v=>v.trim()))yield row}
}
export const CATALOG_COLUMNS={code:['code','代码','产品代码','同花顺代码','thscode','证券代码'],name:['name','名称','产品名称','证券简称','证券名称','基金名称'],issuer:['issuer','机构','发行机构','基金管理人'],type:['type','资产分类'],riskLevel:['riskLevel','风险等级'],currency:['currency','币种']};
