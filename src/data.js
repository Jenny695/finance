/**
 * 所有产品、收益、评分、净值及持仓均为合成演示数据，不对应任何真实产品。
 * 生产接口应由后端调用授权的同花顺 iFinD 服务，浏览器中不得存储 API 密钥。
 * 每个生产指标必须返回 asOf、sourceUrl、documentTitle、retrievedAt、methodology；
 * 没有原始来源时返回 unavailable，前端不得将官网入口当作指标证据。
 */
export const sources = [
  { id: 'ifind', name: '同花顺 iFinD', tag: '市场数据', url: 'https://www.51ifind.com/', description: '拟用于净值序列、市场基准和同类产品数据。需要商业授权，当前未接入。' },
  { id: 'chinawealth', name: '中国理财网', tag: '登记与披露', url: 'https://www.chinawealth.com.cn/', description: '银行业理财登记托管中心相关公开信息入口。当前未获取产品登记及公告原文。' },
  { id: 'issuer', name: '发行机构原始披露文件', tag: '一手资料', url: null, description: '拟接入产品说明书、定期报告和净值公告。演示产品没有对应发行机构或真实文件。' },
];
export const asOf = '2026-10-14';
export const products = [
  { id: 'stable', name: '安盈稳享 180 天', issuer: '示例理财 A', code: 'DEMO-001', type: '固定收益类', risk: 'R2 · 中低风险', amount: 180000, cost: 176800, profit: 3200, nav: 1.0368, annual: 3.42, drawdown: 0.64, volatility: 0.92, score: 83, color: '#165DFF', duration: '180 天', liquidity: '最短持有 180 天，期满后每个工作日开放赎回，演示到账规则为 T+2。', assetNames: ['债券', '现金及存款', '非标准化债权', '其他'], assets: [76, 15, 6, 3], scores: [85, 86, 81, 72, 84, 83, 80], description: '演示组合以债券为主，净值波动相对较小。仍需关注信用风险、利率变化及赎回限制。' },
  { id: 'balanced', name: '丰和多元优选', issuer: '示例理财 B', code: 'DEMO-002', type: '混合类', risk: 'R3 · 中风险', amount: 105000, cost: 103200, profit: 1800, nav: 1.0826, annual: 5.18, drawdown: 3.82, volatility: 4.26, score: 76, color: '#749AFF', duration: '90 天', liquidity: '最短持有 90 天，每周三开放赎回，演示到账规则为 T+3。', assetNames: ['债券', '权益资产', '现金及存款', '其他'], assets: [55, 30, 10, 5], scores: [88, 65, 78, 75, 80, 76, 74], description: '演示组合兼顾债券与权益资产，收益弹性与波动同时增加。资产之间的相关性可能在市场压力下上升。' },
  { id: 'cash', name: '日日盈现金管理', issuer: '示例理财 C', code: 'DEMO-003', type: '现金管理类', risk: 'R1 · 低风险', amount: 50000, cost: 49720, profit: 280, nav: 1.0056, annual: 1.86, drawdown: 0.08, volatility: 0.12, score: 87, color: '#53C5B8', duration: '每日开放', liquidity: '每个工作日开放赎回，演示到账规则为 T+1；节假日可能顺延，不承诺即时到账。', assetNames: ['现金及存款', '短期债券', '其他'], assets: [55, 42, 3], scores: [70, 94, 87, 93, 84, 89, 82], description: '演示组合以现金与短期资产为主，流动性相对较好。低风险并不等于没有风险，也不等同于银行存款。' },
  { id: 'growth', name: '远见成长精选', issuer: '示例理财 D', code: 'DEMO-004', type: '权益类', risk: 'R4 · 中高风险', amount: 33680, cost: 34350, profit: -670, nav: 0.9805, annual: -1.95, drawdown: 8.65, volatility: 12.8, score: 63, color: '#A7B8D9', duration: '365 天', liquidity: '封闭期 365 天，封闭期间不支持赎回，到期按产品规则清算。', assetNames: ['权益资产', '债券', '现金及存款'], assets: [75, 15, 10], scores: [52, 48, 70, 45, 82, 79, 65], description: '演示组合权益资产占比较高，净值波动明显。需要特别评估持有期限和自身对本金损失的承受能力。' },
];
export const dimensions = [
  ['收益表现', '近一年净值增长、收益稳定性及基准表现；不代表未来回报。', 'ifind'],
  ['风险回撤', '最大回撤衡量区间内从最高点到之后最低点的跌幅。', 'ifind'],
  ['底层资产投向', '通过穿透资产类别观察集中度与信用暴露。', 'issuer'],
  ['流动性', '结合封闭期、赎回窗口、到账时间评估资金可用性。', 'issuer'],
  ['发行机构资质', '应核验机构许可、治理及合规披露；资质不构成兑付保证。', 'chinawealth'],
  ['信息披露质量', '关注披露及时性、完整性和原文可追溯性。', 'issuer'],
  ['同类产品对比', '仅应在同类型、同风险、同区间和同费用口径下比较。', 'ifind'],
];
export const currency = value => value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function seriesFor(p, days = 180) {
  const start = Date.UTC(2026, 9, 14) - (days - 1) * 86400000;
  return Array.from({ length: days }, (_, i) => {
    const t = i / (days - 1);
    const fluctuation = Math.sin(i * .26) * p.volatility * .00048 + Math.sin(i * .073) * p.volatility * .0007;
    const value = 1 + (p.nav - 1) * t + fluctuation * Math.sin(Math.PI * t);
    return [new Date(start + i * 86400000).toISOString().slice(0, 10), +value.toFixed(4)];
  });
}
export const api = {
  /** TODO：替换为自己的后端端点。后端负责 iFinD 鉴权、授权范围、缓存及披露文件验证。 */
  async getHoldings() { return { mode: 'mock', asOf, products }; },
  async getProductAnalysis(id) {
    const product = products.find(p => p.id === id);
    if (!product) throw new Error('产品不存在');
    return { mode: 'mock', product, asOf, sources, verified: false, originalDocumentUrl: null };
  },
};
