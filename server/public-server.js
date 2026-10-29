import {createServer} from 'node:http';
import {readFile,stat,mkdir,chown} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApplication} from './application.js';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function startPublicServer({port=Number(process.env.PORT)||3000,host=process.env.BIND_HOST||'0.0.0.0',directory=process.env.DATA_DIR||resolve(root,'.public-data'),origin=process.env.PUBLIC_URL||process.env.RENDER_EXTERNAL_URL||null,config=process.env,query}={}){
 if(config.NODE_ENV==='production'&&(!origin||!origin.startsWith('https://')))throw Error('生产环境需设置HTTPS公开地址PUBLIC_URL');
 if(config.DROP_PRIVILEGES==='1'&&process.getuid?.()===0){await mkdir(directory,{recursive:true});await chown(directory,1000,1000);process.setgid(1000);process.setuid(1000)}
 const app=createApplication({directory,origin,config,query});await app.ready;const dist=resolve(root,'dist');
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.json':'application/json; charset=utf-8','.csv':'text/csv; charset=utf-8'};
 const server=createServer(async(req,res)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");if(origin?.startsWith('https:'))res.setHeader('Strict-Transport-Security','max-age=15552000');
  if(req.url==='/healthz'){res.setHeader('Content-Type','application/json');res.end('{"status":"ok"}');return}
  await app.handle(req,res,async()=>{try{if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;res.end();return}const path=decodeURIComponent(new URL(req.url,'http://internal').pathname);if(path.split('/').some(s=>s.startsWith('.')))throw Error();let file=resolve(dist,'.'+path);if(file!==dist&&!file.startsWith(dist+sep))throw Error();if(path==='/'||!extname(path))file=resolve(dist,'index.html');const type=types[extname(file)];if(!type||!(await stat(file)).isFile())throw Error();const content=await readFile(file);res.setHeader('Content-Type',type);res.setHeader('Cache-Control',file.endsWith('.html')?'no-cache':'public, max-age=3600');res.end(req.method==='HEAD'?undefined:content)}catch{res.statusCode=404;res.end('Not found')}});
 });await new Promise(resolve=>server.listen(port,host,resolve));return {server,app,port:server.address().port,close:()=>new Promise(resolve=>server.close(()=>{app.close();resolve()}))};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const site=await startPublicServer();console.log('知衡网站已启动，端口 '+site.port);for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>site.close().then(()=>process.exit(0)))}
