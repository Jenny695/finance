import { validateSource, PROFILES } from './assessment.js';
export const CATEGORIES = { bank:'银行理财',fund:'公募基金',broker:'券商资管',trust:'信托产品',other:'其他资管' };
export const CODE_PATTERN=/^[A-Z0-9][A-Z0-9._-]{1,39}$/;
export function productRecord(input){
 if(!input||typeof input!=='object'||!CODE_PATTERN.test(input.code||''))throw Error('产品代码需为2—40位大写字母、数字或 . _ -');
 if(typeof input.name!=='string'||!input.name.trim()||input.name.length>150)throw Error('产品名称必填且不超过150字');
 if(!CATEGORIES[input.category])throw Error('产品类别无效');
 if(input.type&&!PROFILES[input.type])throw Error('资产分类只能是 fixed / mixed / cash / equity，未知时留空');
 if(input.riskLevel&&!/^R[1-5]$/.test(input.riskLevel))throw Error('风险等级只能为R1—R5，未知时留空');
 if(input.source&&!validateSource(input.source))throw Error('产品登记信息来源不完整');
 return {code:input.code,name:input.name.trim(),category:input.category,issuer:String(input.issuer||'待核对').slice(0,100),type:input.type||null,riskLevel:input.riskLevel||null,currency:input.currency||null,source:input.source||null,metadataStatus:'待核对',addedAt:new Date().toISOString()};
}
export function catalogRows(input){if(!Array.isArray(input)||!input.length||input.length>10000)throw Error('一次导入1—10000只产品');const result=input.map(productRecord);if(new Set(result.map(p=>p.code)).size!==result.length)throw Error('目录中存在重复产品代码');return result}
export function queryDates(start,end){const valid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;if(!valid(start)||!valid(end)||start>=end)throw Error('起止日期无效，开始日期须早于结束日期');if(Date.parse(end)>Date.now())throw Error('截止日期不能在未来');if((Date.parse(end)-Date.parse(start))/86400000>366*5)throw Error('单次查询最多5年');return {start,end}}
function noSecrets(value){if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)){if(/token|password|secret|cookie|authorization/i.test(k))throw Error('模板不能包含任何凭据');noSecrets(v)}}
export function validateTemplate(template){
 if(!template||!CATEGORIES[template.category])throw Error('请选择查询模板对应的产品类别');
 if(!['date_sequence','cmd_history_quotation'].includes(template.endpoint))throw Error('净值模板仅支持日期序列或历史行情');
 if(!template.payload||typeof template.payload!=='object'||Array.isArray(template.payload))throw Error('模板参数必须为JSON对象');noSecrets(template.payload);
 if(!/^[A-Za-z_][A-Za-z0-9_]{0,149}$/.test(template.field||'')||template.field==='close')throw Error('请填写官方净值指标，股票 close 字段不能用于理财净值模板');
 if(template.endpoint==='date_sequence'&&(!Array.isArray(template.payload.indipara)||!template.payload.indipara.some(i=>i.indicator===template.field)))throw Error('日期序列模板的indipara必须包含选定净值指标');
 if(template.endpoint==='cmd_history_quotation'&&!String(template.payload.indicators||'').split(',').includes(template.field))throw Error('历史模板必须包含选定净值指标');
 if(!['unit','adjusted'].includes(template.navBasis)||!['net','gross'].includes(template.feeBasis)||![12,52,252,365].includes(template.periodsPerYear))throw Error('请明确净值、费用和采样口径');
 if(!['none','yes','unknown'].includes(template.distributions))throw Error('请明确分红状态；不确定时选择unknown');
 if(template.confirmed!==true)throw Error('需对照官方工具确认指标确为净值而非价格、收益率或万份收益');
 // 采样与缺失值填充由服务端控制，不接受Previous等填充方式制造平滑曲线。
 const payload=structuredClone(template.payload);payload.codes='{{code}}';payload.startdate='{{start}}';payload.enddate='{{end}}';payload.functionpara={...(payload.functionpara||{}),Fill:'Blank'};
 if(JSON.stringify(payload).length>30000)throw Error('模板参数过大');
 return {category:template.category,endpoint:template.endpoint,payload,field:template.field,navBasis:template.navBasis,feeBasis:template.feeBasis,periodsPerYear:template.periodsPerYear,distributions:template.distributions,confirmed:true,currency:template.currency||null,updatedAt:new Date().toISOString(),basisConfirmed:true,verification:'用户依据官方工具配置，需实际净值查询验证'};
}
export function templateQuery(template,code,start,end){if(!CODE_PATTERN.test(code))throw Error('请输入有效产品代码');queryDates(start,end);const payload=structuredClone(template.payload);payload.codes=code;payload.startdate=template.endpoint==='date_sequence'?start.replaceAll('-',''):start;payload.enddate=template.endpoint==='date_sequence'?end.replaceAll('-',''):end;payload.functionpara={...(payload.functionpara||{}),Fill:'Blank'};return {endpoint:template.endpoint,payload}}
