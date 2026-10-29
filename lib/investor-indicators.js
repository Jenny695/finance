// 普通投资者的活跃查询清单。原始字段档案只用于历史数据兼容，不参与默认查询。
import {suppliedIndicator} from './indicator-catalog.js';
export const INVESTOR_GROUPS={core:'净值与回撤',fees:'持有与交易费用',returns:'收益与分红',risk:'波动与下跌',efficiency:'收益风险效率',assets:'资产配置',rates:'久期与利率',peers:'同类统计'};
const selected=[
 ['ths_unit_nv_fund','单位净值','用于计算区间变化与净值走势'],
 ['ths_adjustment_factor_fund','净值复权因子','辅助核对单位净值与复权净值，不按大小打分'],
 ['ths_adjust_unit_nvg_since_founded_fund','成立以来复权增长率','成立以来的静态读数，不替代本次查询期间收益'],
 ['ths_retracement_fund','当前相对前高回撤','当前回撤状态，不等同所选区间最大回撤'],
 ['ths_adjustment_nv_fund','复权单位净值','优先用于净值评分，沿用官方复权口径'],
 ['ths_accum_unit_nv_fund','累计单位净值','补充分红累计信息，不当作分红再投资总回报'],
 ['ths_manage_fee_rate_fund','管理费率','用于固定年费合计，不含业绩报酬'],
 ['ths_mandate_fee_rate_fund','托管费率','用于固定年费合计'],
 ['ths_sales_service_fee_fund','销售服务费率','用于固定年费合计'],
 ['ths_purchasefee_fund','认购费率','本次参数条件下的原始费率，不并入固定年费'],
 ['ths_subscriptionfee_fund','申购费率','本次参数条件下的原始费率，不并入固定年费'],
 ['ths_redemptionfee_fund','赎回费率','不等同可赎回时间或完整阶梯规则'],
 ['ths_stock_mv_to_fanv_fund','股票占净资产比例','用于配置图，不单独评安全性'],
 ['ths_bond_mv_to_fanv_fund','债券占净资产比例','用于配置图，不等同债券信用质量'],
 ['ths_fund_mv_to_fanv_fund','基金投资占净资产比例','用于配置图，不重复穿透基金持仓'],
 ['ths_bank_deposit_to_fanv_fund','存款占净资产比例','用于配置图，不等同随时可赎回'],
 ['ths_max_retrace_rate_all_fund','最大回撤','官方原始读数；评分从同区间净值独立复算'],
 ['ths_annual_yield_fund','年化收益','收益表现补充读数'],
 ['ths_unit_dividend_y_fund','年度分红','帮助理解分红；不是完整再投资回报'],
 ['ths_annual_volatility_fund','年化波动率','波动幅度补充读数'],
 ['ths_downside_risk_fund','下行风险','下跌幅度补充读数'],
 ['ths_sharp_annual_fund','夏普比率','承担波动所对应收益的补充读数'],
 ['ths_sortino_annul_fund','索提诺比率','下跌风险所对应收益的补充读数'],
 ['ths_calmar_ratio_fund','卡玛比率','收益与回撤关系的补充读数'],
 ['ths_income_standard_deviation_fund','收益标准差','衡量收益离散程度，与复算波动相互核验'],
 ['ths_downside_standard_deviation_fund','下行标准差','单独观察下跌方向的波动'],
 ['ths_portfolio_duration_fund','组合久期','说明利率敏感程度，不将久期越小等同产品越好'],
 ['ths_rate_sensitive_fund','利率敏感性','解释债券类风险暴露，不直接合成安全等级'],
 ['ths_similar_product_avg_annualvolatility_fund','同类平均年化波动','提供方同类统计，保持其原统计窗口'],
 ['ths_similar_product_avg_downside_risk_fund','同类平均下行风险','与同参数下行风险对照，不当作全市场排名'],
 ['ths_similar_product_avg_maximum_drawdown_fund','同类平均最大回撤','同类背景信息，窗口一致后才能比较'],

];
export const INVESTOR_INDICATORS=selected.map(([field,label,purpose])=>({...suppliedIndicator(field),label,purpose}));
const byField=new Map(INVESTOR_INDICATORS.map(i=>[i.field,i]));
export const isInvestorField=field=>byField.has(field);
export function investorRows(results){return results.filter(r=>isInvestorField(r.field)).map(r=>({...r,label:byField.get(r.field).label,purpose:byField.get(r.field).purpose}))}
export const DEFAULT_INVESTOR_GROUPS=Object.keys(INVESTOR_GROUPS);
export function investorBatches(groups){return Object.entries(INVESTOR_GROUPS).filter(([group])=>groups.includes(group)).flatMap(([group,label])=>{const fields=INVESTOR_INDICATORS.filter(r=>r.group===group).map(r=>r.field);return group==='core'?[{id:'core-base',label:'单位净值与回撤',fields:fields.filter(f=>!['ths_adjustment_nv_fund','ths_accum_unit_nv_fund','ths_adjustment_factor_fund'].includes(f))},{id:'core-adjusted',label:'复权与累计净值',fields:['ths_adjustment_nv_fund','ths_accum_unit_nv_fund','ths_adjustment_factor_fund']}]:[{id:group+'-investor',label,fields}]})}
