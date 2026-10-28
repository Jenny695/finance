import {fileURLToPath} from 'node:url';
import {curatedPublicBundle} from './enrichment.js';
import {openDatabase} from './database.js';
import {assessEvidenceOnly,validateSource} from '../lib/assessment.js';
import {ConnectorError} from './connectors.js';
const directory=fileURLToPath(new URL('../.local/',import.meta.url));
const reasons={return:'缺少经确认的含分红总回报序列，不能据单位净值1推断零收益。',risk:'缺少有效风险序列和统计口径，不能据单位净值恒定推断零风险。',liquidity:'未取得完整持有期、开放频率、到账及暂停赎回条款。',issuer:'报告披露管理人与托管人，但许可、登记及年度材料尚未完整核对。',disclosure:'已取得定期报告，说明书、费用、赎回及披露时效材料尚未齐全。',peer:'缺少同类型、风险、币种、区间与费用口径一致的同类样本。'};
export function createPublicLibrary({folder=directory,clock=()=>Date.now(),bundle=curatedPublicBundle}={}){
 let db=null;
 function load(){if(db)return db;const value=bundle(new Date(clock()).toISOString().slice(0,10));
  if(!/^C\d{10,30}$/.test(value.registrationCode||'')||!validateSource(value.source)||new URL(value.source.url).hostname!=='www.jn-bank.com'||!value.checkedAt)throw new ConnectorError('内置公开报告缺少有效登记编码或核验来源',500);
  db=openDatabase(folder);db.importPublicBundle(value);return db;
 }
 function catalog(params={}){return {...load().publicCatalog(params),mode:'public',scope:'已核实官网历史资料；当前1只产品、2份报告，不代表全市场或实时取数'}}
 function detail(code){if(!/^C\d{10,30}$/.test(code||''))throw new ConnectorError('公开资料请使用全国登记编码；不自动认定同花顺内部代码与其一致');const result=load().publicDetail(code);if(!result)throw new ConnectorError('当前公开资料库没有此产品，未用演示数据代替',404);const reference={...result.reports[0],ageDays:Math.max(0,Math.floor((clock()-Date.parse(result.reports[0].asOf))/86400000))};const assessment=assessEvidenceOnly({name:result.product.name,evidence:reference.evidence,reason:'仅资产披露明细具备评分材料，收益、风险等核心维度不齐全，暂不出综合分'});assessment.dimensions=assessment.dimensions.map(d=>({...d,formula:reasons[d.id]||d.formula}));
  return {...result,reference,assessment,mode:'public',currentData:false,ifindQueried:false,notice:'此前核对的官网历史报告已自动入库；本次读取未访问同花顺或刷新官网。入库时间不是原文获取或披露时间。'};
 }
 return {catalog,detail,close:()=>db?.close()};
}
export const publicLibrary=createPublicLibrary();
