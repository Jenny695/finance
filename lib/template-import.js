/** 只解析官方 THS_DS 的六个字符串字面量，不执行 Python / JavaScript。 */
export function parseOfficialDS(text){
 if(typeof text!=='string'||text.length>20000)throw Error('查询函数文本过长');
 if(/THS_iFinDLogin|refresh_token|access_token|password|passwd/i.test(text))throw Error('请删除登录函数和凭据，只粘贴THS_DS查询函数');
 const clean=text.split(/\r?\n/).filter(l=>!l.trim().startsWith('#')).join('\n').trim();
 const m=clean.match(/^(?:\w+\s*=\s*)?THS_DS\s*\(([\s\S]*)\)\s*;?$/);if(!m)throw Error('请粘贴官方生成的THS_DS(...)函数，或在高级设置填写HTTP参数');
 const args=[];const body=m[1];let i=0;
 while(i<body.length){while(/\s/.test(body[i]||'')&&i<body.length)i++;const quote=body[i++];if(!['"',"'"].includes(quote))throw Error('只接受六个普通字符串参数，不接受表达式或可执行代码');let value='',closed=false;while(i<body.length){let c=body[i++];if(c==='\\'){const next=body[i++];if(![quote,'\\'].includes(next))throw Error('查询参数存在不支持的转义');value+=next}else if(c===quote){closed=true;break}else value+=c}if(!closed)throw Error('函数引号未闭合');args.push(value);while(i<body.length&&/\s/.test(body[i]))i++;if(i<body.length&&body[i++]!==',')throw Error('查询函数参数格式无效')}
 if(args.length!==6)throw Error('THS_DS需包含代码、指标、指标参数、全局参数、开始日期和结束日期六项');
 const [code,indicators,params,global,start,end]=args;const fields=indicators.split(';');const parameters=params.split(';');if(fields.length!==1)throw Error('首次配置请只选择一个净值指标');
 const functionpara={};for(const item of global.split(',').filter(Boolean)){const index=item.indexOf(':');if(index<1)throw Error('全局参数格式无效');functionpara[item.slice(0,index)]=item.slice(index+1)}
 return {code,field:fields[0],start,end,endpoint:'date_sequence',payload:{codes:code,startdate:start.replaceAll('-',''),enddate:end.replaceAll('-',''),functionpara:{...functionpara,Fill:'Blank'},indipara:[{indicator:fields[0],indiparams:parameters[0]?parameters[0].split(','):['']}]} };
}
