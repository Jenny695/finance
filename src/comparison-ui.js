import * as echarts from 'echarts/core';
import {LineChart,RadarChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent,RadarComponent} from 'echarts/components';
import {SVGRenderer} from 'echarts/renderers';
import {fetchAnalysisReport} from './analysis-client.js';
import {DEFAULT_INVESTOR_GROUPS} from '../lib/investor-indicators.js';
import {SIMPLE_DIMENSIONS,evaluateClassifiedReport} from '../lib/classified-assessment.js';
import {CATEGORIES} from '../lib/catalog.js';
echarts.use([LineChart,RadarChart,GridComponent,TooltipComponent,LegendComponent,RadarComponent,SVGRenderer]);
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=n=>Number.isFinite(n)?(n*100).toFixed(2)+'%':null;
export function comparisonPage(products){const end=new Date();end.setUTCDate(end.getUTCDate()-1);const start=new Date(end);start.setUTCFullYear(start.getUTCFullYear()-1);return `<div class="portal"><div class="p-page-intro"><div class="p-kicker">SIDE BY SIDE</div><h1>产品对比</h1><p>同一观察区间，看清收益、风险与持有成本。</p></div><section class="p-panel"><div class="p-section-heading"><h2>已选 ${products.length} 只产品</h2><a href="#/">继续选择 →</a></div>${products.length<2?'<p class="p-paragraph">从产品查询页选择2—4只产品。</p>':`<div class="p-comparison-chips">${products.map(p=>`<span>${e(p.code)}${p.mode==='demo'?' · 演示':''}</span>`).join('')}</div><div class="p-config-fields"><label class="p-input-label">开始日期<input id="compare-start" type="date" value="${start.toISOString().slice(0,10)}"></label><label class="p-input-label">截止日期<input id="compare-end" type="date" value="${end.toISOString().slice(0,10)}"></label></div><label class="p-confirm mt-4"><input id="compare-refresh" type="checkbox">重新获取数据（使用接口额度）</label><div class="db-actions"><button class="p-primary" id="run-comparison">查询并对比</button><button class="p-secondary" id="stop-comparison" hidden>停止</button></div><p class="ca-note">优先读取同区间已存报告；缺少报告时使用iFinD授权查询，每只产品最多9次分组请求。</p><p id="comparison-progress" class="ca-note" role="status"></p><div id="comparison-result"></div>`}</section></div>`}
export function mountComparisonPage(products,{request,demoResearchData}){
 let active=true,running=false,cancelled=false,charts=[];const by=id=>document.getElementById(id);const button=by('run-comparison');if(!button)return()=>{};
 const resize=()=>charts.forEach(c=>c.resize());window.addEventListener('resize',resize);
 const dispose=()=>{charts.forEach(c=>c.dispose());charts=[]};const alive=()=>active&&!cancelled;
 by('stop-comparison').onclick=()=>{cancelled=true;by('comparison-progress').textContent='正在停止后续查询…'};
 function draw(id,option){const el=by(id);if(!el)return;const c=echarts.init(el,null,{renderer:'svg'});c.setOption(option);charts.push(c)}
 function render(reports,failures){dispose();const rows=[
  ['产品类别',r=>CATEGORIES[r.category]],['风险等级',r=>r.context.product?.riskLevel||null],['实际净值区间',r=>r.evaluation.metrics?`${r.evaluation.metrics.startDate} — ${r.evaluation.metrics.endDate}`:null],
  ['区间净值变化',r=>r.evaluation.metricScores.find(m=>m.id==='return'&&!m.field)?pct(r.evaluation.metrics?.periodReturn):null],
  ['最大回撤',r=>r.evaluation.metricScores.find(m=>m.id==='risk')?pct(r.evaluation.metricScores.find(m=>m.id==='risk').value):null],
  ['年化波动',r=>pct(r.evaluation.metrics?.volatility)],['下行波动',r=>r.evaluation.research?pct(r.evaluation.research.downsideDeviation):null],
  ['当前回撤',r=>pct(r.evaluation.research?.currentDrawdown)],['当前回撤持续',r=>r.evaluation.research?r.evaluation.research.currentUnderwaterDays+'天':null],
  ['已知固定年费',r=>r.evaluation.costs.score!==null?pct(r.evaluation.costs.knownTotal)+(r.evaluation.costs.total===null?'（至少）':''):null],
  ...SIMPLE_DIMENSIONS.map(d=>[d.name+'评分',r=>r.evaluation.assessment.dimensions.find(x=>x.id===d.id)?.score??null]),
  ['综合参考分',r=>r.evaluation.summary.score],['可评维度',r=>r.evaluation.summary.availableDimensions+'个'],
  ['数据来源',r=>r.origin==='workbook'?'已存报告（导入文件）':r.reused?'已存报告（iFinD）':r.mode==='demo'?'合成演示':r.partial?'iFinD授权查询（部分结果）':'iFinD授权查询']
 ].filter(([,value])=>reports.some(r=>value(r)!==null&&value(r)!==undefined));
 const paths=reports.filter(r=>r.evaluation.metrics?.rows.length>1&&r.evaluation.research);
 const common=SIMPLE_DIMENSIONS.filter(d=>{const dims=reports.map(r=>r.evaluation.assessment.dimensions.find(x=>x.id===d.id));return reports.length>=2&&dims.every(x=>Number.isFinite(x?.score)&&x.scope!=='iFinD默认参数统计值')&&new Set(dims.map(x=>x.formula)).size===1&&new Set(dims.map(x=>x.scope)).size===1&&new Set(dims.map(x=>x.basisKey)).size===1});
 const sameBasis=reports.length>=2&&new Set(reports.map(r=>JSON.stringify([r.category,r.context.product?.type,r.context.product?.riskLevel,r.context.product?.currency,r.evaluation.metrics?.startDate,r.evaluation.metrics?.endDate,r.evaluation.navField]))).size===1&&reports.every(r=>r.context.product?.type&&r.context.product?.riskLevel&&r.context.product?.currency);
 const headers=`<thead><tr><th>对比指标</th>${reports.map(r=>`<th>${e(r.context.product?.name||r.code)}<br><small>${e(r.code)}</small></th>`).join('')}</tr></thead>`;
 const table=dataRows=>`<div class="table-wrap"><table>${headers}<tbody>${dataRows.map(([label,value])=>`<tr><td>${e(label)}</td>${reports.map(r=>`<td>${e(value(r)??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 by('comparison-result').innerHTML=`${failures.length?`<div class="p-model-note">${failures.map(f=>`<p>${e(f)}</p>`).join('')}</div>`:''}${reports.length?`<div class="ca-compare-products">${reports.map(r=>`<article><h3>${e(r.context.product?.name||r.code)}</h3><small>${e(r.code)} · ${e(CATEGORIES[r.category])}</small>${r.evaluation.summary.score!==null?`<strong>${r.evaluation.summary.score}<small> / 100 · ${r.evaluation.summary.availableDimensions}维参考分</small></strong>`:''}<a href="#/${r.mode==='demo'?'explore':'analysis'}/${encodeURIComponent(r.code)}?category=${encodeURIComponent(r.category)}${r.mode==='demo'?'&mode=demo':''}">完整分析 →</a></article>`).join('')}</div><p class="ca-note">${sameBasis?'已按相同产品属性和观察窗口整理。':'展示实际差异，不按不同类别、统计口径或覆盖率直接排名。'}</p><div class="ca-compare-charts">${paths.length>=2?'<section class="ca-section"><h2>净值变化对比</h2><p class="ca-note">首个有效净值归一为100</p><div id="comparison-nav" class="db-chart" style="height:330px"></div></section>':''}${common.length>=3?'<section class="ca-section"><h2>共同可评维度</h2><p class="ca-note">仅展示计算方法与观察口径一致的维度</p><div id="comparison-radar" class="db-chart" style="height:330px"></div></section>':''}</div><section class="ca-section"><h2>关键指标</h2>${table(rows.filter(([label])=>!label.endsWith('评分')))}</section>${rows.some(([label])=>label.endsWith('评分'))?`<details class="ca-scope"><summary>维度评分明细</summary>${table(rows.filter(([label])=>label.endsWith('评分')))}</details>`:''}`:'<div class="p-empty">未取得可展示报告，请检查数据连接后重试。</div>'}`;

 if(paths.length>=2)draw('comparison-nav',{color:['#165dff','#19a59e','#d6952d','#a36cdb'],animation:false,legend:{type:'scroll',bottom:0},tooltip:{trigger:'axis'},grid:{left:60,right:25,top:20,bottom:65},xAxis:{type:'time'},yAxis:{type:'value',scale:true},series:paths.map(r=>({name:r.code,type:'line',symbol:'none',data:r.evaluation.metrics.rows.map(p=>[p.date,p.nav/r.evaluation.metrics.rows[0].nav*100])}))});
 if(common.length>=3)draw('comparison-radar',{color:['#165dff','#19a59e','#d6952d','#a36cdb'],animation:false,legend:{type:'scroll',bottom:0},tooltip:{trigger:'item'},radar:{indicator:common.map(d=>({name:d.name,max:100})),radius:'52%',axisName:{fontSize:11,color:'#52647b'},splitLine:{lineStyle:{color:'#e0e8f3'}},splitArea:{areaStyle:{color:['#fff','#f7faff']}}},series:[{type:'radar',data:reports.map(r=>({name:r.code,value:common.map(d=>r.evaluation.assessment.dimensions.find(x=>x.id===d.id).score)}))}]});
 }
 button.onclick=async()=>{if(running)return;running=true;cancelled=false;button.disabled=true;by('stop-comparison').hidden=false;by('compare-start').disabled=true;by('compare-end').disabled=true;by('compare-refresh').disabled=true;const reports=[],failures=[];dispose();by('comparison-result').innerHTML='';
 try{const range={start:by('compare-start').value,end:by('compare-end').value};if(!range.start||!range.end||range.start>=range.end)throw Error('请选择有效的起止日期');if(new Set(products.map(p=>p.mode==='demo')).size>1)throw Error('演示与真实产品请分别对比');
 for(let i=0;i<products.length;i++){if(!alive())break;const p=products[i];try{let report;
 if(p.mode==='demo'){const d=demoResearchData(p.code);const context={product:d.product,template:{navBasis:'adjusted',distributions:'none'}};report={code:p.code,category:d.product.category,mode:'demo',context,evaluation:evaluateClassifiedReport([{field:'ths_adjustment_nv_fund',status:'returned-unverified',source:d.source,series:d.series.filter(x=>x.date>=range.start&&x.date<=range.end).map(x=>({date:x.date,value:x.nav}))}],context)}}
 else report=await fetchAnalysisReport({code:p.code,category:p.category,...range,groups:DEFAULT_INVESTOR_GROUPS},{request,alive,reuse:!by('compare-refresh').checked,onProgress:r=>{if(active)by('comparison-progress').textContent=`${i+1}/${products.length} · ${p.code} · ${r.progress.completed}/${r.progress.total}`}});
 if(!active)return;if(report.partial)failures.push(p.code+'：部分分组请求未完成，以下保留有效数据。');reports.push(report);
 }catch(error){if(!alive())break;failures.push(p.code+'：'+error.message)}if(active)render(reports,failures)}
 if(active)by('comparison-progress').textContent=cancelled?'已停止，已完成结果保留':`完成 · ${reports.length}/${products.length}只产品`;
 }catch(error){if(active)by('comparison-progress').textContent=error.message}finally{running=false;if(active){button.disabled=false;by('stop-comparison').hidden=true;by('compare-start').disabled=false;by('compare-end').disabled=false;by('compare-refresh').disabled=false}}
 };
 return()=>{active=false;cancelled=true;dispose();window.removeEventListener('resize',resize)};
}
