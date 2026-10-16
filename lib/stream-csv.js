// 流式UTF-8 CSV：跨块的引号、引号转义、CRLF及引号内换行均保留。
export async function* streamCSV(chunks){
 const decoder=new TextDecoder('utf-8',{fatal:true});let field='',row=[],quoted=false,closed=false,skipLF=false,first=true;
 function take(c){if(first){first=false;if(c==='\uFEFF')return}if(skipLF){skipLF=false;if(c==='\n')return}if(quoted){if(c==='"'){quoted=false;closed=true}else{field+=c;if(field.length>5000)throw Error('CSV单字段超过5000字')}return}if(closed&&c==='"'){field+='"';quoted=true;closed=false;return}if(c==='"'){if(field||closed)throw Error('CSV引号格式无效');quoted=true;return}if(c===','||c==='\n'||c==='\r'){row.push(field);field='';closed=false;if(row.length>100)throw Error('CSV列数超过100');if(c!==','){const done=row;row=[];if(c==='\r')skipLF=true;return done.some(v=>v.trim())?done:null}return}if(closed)throw Error('CSV引号后存在无效字符');field+=c;if(field.length>5000)throw Error('CSV单字段超过5000字')}
 for await(const chunk of chunks){const text=typeof chunk==='string'?chunk:decoder.decode(chunk,{stream:true});for(const c of text){const result=take(c);if(result)yield result}}
 for(const c of decoder.decode()){const result=take(c);if(result)yield result}if(quoted)throw Error('CSV引号未闭合');if(field||row.length||closed){row.push(field);if(row.some(v=>v.trim()))yield row}
}
export const CATALOG_COLUMNS={code:['code','代码','产品代码','同花顺代码','thscode','证券代码'],name:['name','名称','产品名称','证券简称','基金名称'],issuer:['issuer','机构','发行机构','基金管理人'],type:['type','资产分类'],riskLevel:['riskLevel','风险等级'],currency:['currency','币种']};
