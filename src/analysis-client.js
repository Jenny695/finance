/** Shared report workflow. Neither comparison nor analysis requires a category template. */
export async function fetchAnalysisReport(input,{request,alive=()=>true,onProgress=()=>{},reuse=true,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const check=()=>{if(!alive())throw new Error('查询已停止')};check();
 if(reuse)try{const saved=await request('/api/analysis/latest?code='+encodeURIComponent(input.code));check();if(saved.state==='completed'&&saved.start===input.start&&saved.end===input.end&&saved.code===input.code&&saved.category===input.category&&(input.groups||[]).every(g=>saved.selectedGroups?.includes(g))&&saved.progress.valid>0&&saved.progress.failed===0)return {...saved,reused:true}}catch(error){if(!alive())throw error}
 let report=await request('/api/analysis/start',{...input,confirmed:true});onProgress(report);if(!alive()){if(report.state==='running')await request('/api/analysis/control',{id:report.id,action:'pause'}).catch(()=>{});check()}
 if(report.state==='blocked-credentials')throw new Error('市场数据服务暂未开放，请稍后查询');
 while(report.state==='running'){
  await wait(1150);
  if(!alive()){await request('/api/analysis/control',{id:report.id,action:'pause'}).catch(()=>{});check()}
  report=await request('/api/analysis/step',{id:report.id});
  if(!alive()){if(report.state==='running')await request('/api/analysis/control',{id:report.id,action:'pause'}).catch(()=>{});check()}
  onProgress(report);
 }
 if(!report.progress?.valid)throw new Error(report.lastFailure?.message||(report.progress?.failed?'数据请求失败，请检查授权和网络后重试':'所选产品与区间未返回有效指标'));
 return {...report,partial:report.state!=='completed'||report.progress.failed>0};
}
