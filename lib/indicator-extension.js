// 用户提供函数中筛选的新字段；不含凭据或实际返回值。
export const EXTENDED_INDICATORS=[
  {
    "field": "ths_adjustment_nv_fund",
    "label": "复权单位净值",
    "group": "core",
    "parameters": [
      ""
    ],
    "valueType": "number",
    "kind": "nav",
    "unit": "unknown",
    "window": "unknown",
    "signConvention": "unknown",
    "fieldEvidence": "用户2026-10-29官方THS_DS函数，参数逐项保留",
    "interpretation": "以实际返回与明确单位为准；不因字段出现就视为有数据"
  },
  {
    "field": "ths_accum_unit_nv_fund",
    "label": "累计单位净值",
    "group": "core",
    "parameters": [
      ""
    ],
    "valueType": "number",
    "kind": "nav",
    "unit": "unknown",
    "window": "unknown",
    "signConvention": "unknown",
    "fieldEvidence": "用户2026-10-29官方THS_DS函数，参数逐项保留",
    "interpretation": "以实际返回与明确单位为准；不因字段出现就视为有数据"
  },
  {
    "field": "ths_manage_fee_rate_fund",
    "label": "管理费率",
    "group": "fees",
    "parameters": [
      ""
    ],
    "valueType": "scalar",
    "kind": "rate",
    "unit": "unknown",
    "window": "unknown",
    "signConvention": "unknown",
    "fieldEvidence": "用户2026-10-29官方THS_DS函数，参数逐项保留",
    "interpretation": "以实际返回与明确单位为准；不因字段出现就视为有数据"
  },
  {
    "field": "ths_mandate_fee_rate_fund",
    "label": "托管费率",
    "group": "fees",
    "parameters": [
      ""
    ],
    "valueType": "scalar",
    "kind": "rate",
    "unit": "unknown",
    "window": "unknown",
    "signConvention": "unknown",
    "fieldEvidence": "用户2026-10-29官方THS_DS函数，参数逐项保留",
    "interpretation": "以实际返回与明确单位为准；不因字段出现就视为有数据"
  },
  {
    "field": "ths_sales_service_fee_fund",
    "label": "销售服务费率",
    "group": "fees",
    "parameters": [
      ""
    ],
    "valueType": "scalar",
    "kind": "rate",
    "unit": "unknown",
    "window": "unknown",
    "signConvention": "unknown",
    "fieldEvidence": "用户2026-10-29官方THS_DS函数，参数逐项保留",
    "interpretation": "以实际返回与明确单位为准；不因字段出现就视为有数据"
  },
  {
    "field": "ths_purchasefee_fund",
    "label": "认购费率",
    "group": "fees",
    "parameters": [
      "101"
    ],
    "valueType": "scalar",
    "kind": "rate",
    "unit": "unknown",
    "window": "unknown",
    "signConvention": "unknown",
    "fieldEvidence": "用户2026-10-29官方THS_DS函数，参数逐项保留",
    "interpretation": "以实际返回与明确单位为准；不因字段出现就视为有数据"
  },
  {
    "field": "ths_subscriptionfee_fund",
    "label": "申购费率",
    "group": "fees",
    "parameters": [
      "101"
    ],
    "valueType": "scalar",
    "kind": "rate",
    "unit": "unknown",
    "window": "unknown",
    "signConvention": "unknown",
    "fieldEvidence": "用户2026-10-29官方THS_DS函数，参数逐项保留",
    "interpretation": "以实际返回与明确单位为准；不因字段出现就视为有数据"
  },
  {
    "field": "ths_redemptionfee_fund",
    "label": "赎回费率",
    "group": "fees",
    "parameters": [
      "101"
    ],
    "valueType": "scalar",
    "kind": "rate",
    "unit": "unknown",
    "window": "unknown",
    "signConvention": "unknown",
    "fieldEvidence": "用户2026-10-29官方THS_DS函数，参数逐项保留",
    "interpretation": "以实际返回与明确单位为准；不因字段出现就视为有数据"
  },
  {
    "field": "ths_stock_mv_to_fanv_fund",
    "label": "股票占净资产比例",
    "group": "assets",
    "parameters": [
      ""
    ],
    "valueType": "scalar",
    "kind": "allocation",
    "unit": "unknown",
    "window": "unknown",
    "signConvention": "unknown",
    "fieldEvidence": "用户2026-10-29官方THS_DS函数，参数逐项保留",
    "interpretation": "以实际返回与明确单位为准；不因字段出现就视为有数据"
  },
  {
    "field": "ths_bond_mv_to_fanv_fund",
    "label": "债券占净资产比例",
    "group": "assets",
    "parameters": [
      ""
    ],
    "valueType": "scalar",
    "kind": "allocation",
    "unit": "unknown",
    "window": "unknown",
    "signConvention": "unknown",
    "fieldEvidence": "用户2026-10-29官方THS_DS函数，参数逐项保留",
    "interpretation": "以实际返回与明确单位为准；不因字段出现就视为有数据"
  },
  {
    "field": "ths_fund_mv_to_fanv_fund",
    "label": "基金投资占净资产比例",
    "group": "assets",
    "parameters": [
      ""
    ],
    "valueType": "scalar",
    "kind": "allocation",
    "unit": "unknown",
    "window": "unknown",
    "signConvention": "unknown",
    "fieldEvidence": "用户2026-10-29官方THS_DS函数，参数逐项保留",
    "interpretation": "以实际返回与明确单位为准；不因字段出现就视为有数据"
  },
  {
    "field": "ths_bank_deposit_to_fanv_fund",
    "label": "存款占净资产比例",
    "group": "assets",
    "parameters": [
      ""
    ],
    "valueType": "scalar",
    "kind": "allocation",
    "unit": "unknown",
    "window": "unknown",
    "signConvention": "unknown",
    "fieldEvidence": "用户2026-10-29官方THS_DS函数，参数逐项保留",
    "interpretation": "以实际返回与明确单位为准；不因字段出现就视为有数据"
  },
  {
    "field": "ths_adjustment_factor_fund",
    "label": "净值复权因子",
    "group": "core",
    "kind": "factor",
    "valueType": "number",
    "parameters": [
      ""
    ],
    "unit": "unknown",
    "window": "unknown",
    "signConvention": "unknown",
    "fieldEvidence": "用户官方函数及导出中文列名对应",
    "interpretation": "静态读数不替代所选期间的真实历史净值"
  },
  {
    "field": "ths_adjust_unit_nvg_since_founded_fund",
    "label": "成立以来复权增长率",
    "group": "returns",
    "kind": "snapshot",
    "valueType": "scalar",
    "parameters": [
      ""
    ],
    "unit": "unknown",
    "window": "unknown",
    "signConvention": "unknown",
    "fieldEvidence": "用户官方函数及导出中文列名对应",
    "interpretation": "静态读数不替代所选期间的真实历史净值"
  },
  {
    "field": "ths_retracement_fund",
    "label": "当前相对前高回撤",
    "group": "risk",
    "kind": "snapshot",
    "valueType": "scalar",
    "parameters": [
      ""
    ],
    "unit": "unknown",
    "window": "unknown",
    "signConvention": "unknown",
    "fieldEvidence": "用户官方函数及导出中文列名对应",
    "interpretation": "静态读数不替代所选期间的真实历史净值"
  }
];
