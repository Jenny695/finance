import test from 'node:test';
import assert from 'node:assert/strict';
import {workbookToInvestorData} from '../lib/workbook-export.js';
const headers=['序号','时间','代码','管理费率','托管费率','销售服务费率','单位净值','复权单位净值','基金公司指数区间收益'];
test('超级命令导出映射实际日期和字段，保留--给缺失解析，排除管理人指数与来源脚注',()=>{const r=workbookToInvestorData([headers,['1',new Date('2026-09-29T00:00:00Z'),'SYNTH01.OF',.4,.1,'--',1.01,1.02,99],['2','2026/10/29','SYNTH01.OF',.4,.1,'--',1.01,1.02,99],['数据来源：同花顺iFinD']]);assert.equal(r.code,'SYNTH01.OF');assert.deepEqual(r.time,['2026-09-29','2026-10-29']);assert.deepEqual(r.table.ths_manage_fee_rate_fund,[.4,.4]);assert.equal(Object.keys(r.table).length,5);assert.ok(!r.table.ths_yeild_gp_fund)});
test('拒绝目录冒充结果、多产品、重复日期和重复指标；不执行表格文本',()=>{for(const rows of [[['证券代码','证券名称'],['A.OF','甲']],[headers,['1','2026-09-29','A.OF',.4],['2','2026-09-29','B.OF',.4]],[headers,['1','2026-09-29','A.OF',.4],['2','2026-09-29','A.OF',.4]],[['时间','代码','管理费率','ths_manage_fee_rate_fund'],['2026-09-29','A.OF',.4,.4]]])assert.throws(()=>workbookToInvestorData(rows))});
