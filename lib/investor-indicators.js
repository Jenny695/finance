// 普通投资者的活跃查询清单。原始字段档案只用于历史数据兼容，不参与默认查询。
import {suppliedIndicator} from './indicator-catalog.js';
export const INVESTOR_GROUPS={core:'净值与回撤',returns:'收益与分红',risk:'波动与下跌',efficiency:'收益风险效率',assets:'资产配置'};
const selected=[
 ['ths_unit_nv_fund','单位净值','用于计算区间变化与净值走势'],
 ['ths_max_retrace_rate_all_fund','最大回撤','官方原始读数；评分从同区间净值独立复算'],
 ['ths_annual_yield_fund','年化收益','收益表现补充读数'],
 ['ths_unit_dividend_y_fund','年度分红','帮助理解分红；不是完整再投资回报'],
 ['ths_annual_volatility_fund','年化波动率','波动幅度补充读数'],
 ['ths_downside_risk_fund','下行风险','下跌幅度补充读数'],
 ['ths_sharp_annual_fund','夏普比率','承担波动所对应收益的补充读数'],
 ['ths_sortino_annul_fund','索提诺比率','下跌风险所对应收益的补充读数'],
 ['ths_calmar_ratio_fund','卡玛比率','收益与回撤关系的补充读数'],
 ['ths_stock_invest_mv_fund','股票投资市值','了解股票配置，不直接按市值大小评分'],
 ['ths_bond_invest_mv_fund','债券投资市值','了解债券配置，不等同安全性'],
 ['ths_bank_deposit_fund','银行存款','了解存款配置，不等同随时可赎回'],
];
export const INVESTOR_INDICATORS=selected.map(([field,label,purpose])=>({...suppliedIndicator(field),label,purpose}));
const byField=new Map(INVESTOR_INDICATORS.map(i=>[i.field,i]));
export const isInvestorField=field=>byField.has(field);
export function investorRows(results){return results.filter(r=>isInvestorField(r.field)).map(r=>({...r,label:byField.get(r.field).label,purpose:byField.get(r.field).purpose}))}
export function investorBatches(groups){return Object.entries(INVESTOR_GROUPS).filter(([group])=>groups.includes(group)).map(([group,label])=>({id:group+'-investor',label,fields:INVESTOR_INDICATORS.filter(r=>r.group===group).map(r=>r.field)}))}
