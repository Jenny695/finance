let current=null,epoch=0;
export const viewer=()=>current;
export const isAdmin=()=>current?.role==='admin';
export function setViewer(user){current=user||null;epoch++}
export async function requestJSON(path,body){const started=epoch;const response=await fetch(path,body===undefined?{credentials:'same-origin'}:{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let data;try{data=await response.json()}catch{throw Error('服务暂不可用，请稍后重试')}if(!response.ok){if(response.status===401&&current&&epoch===started&&!path.startsWith('/api/auth/'))window.dispatchEvent(new Event('zh-session-expired'));throw Error(data.error||'暂时无法完成操作')}return data}
