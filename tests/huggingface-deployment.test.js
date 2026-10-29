import test from 'node:test';
import assert from 'node:assert/strict';
import {publicOrigin,startPublicServer} from '../server/public-server.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {request as httpRequest} from 'node:http';
test('Spaces使用平台HTTPS域名，显式自定义地址和Render优先；不接受带路径、端口或凭据的SPACE_HOST',()=>{
 assert.equal(publicOrigin({SPACE_HOST:'investor-finance.hf.space'}),'https://investor-finance.hf.space');
 assert.equal(publicOrigin({PUBLIC_URL:'https://finance.example.com',SPACE_HOST:'investor-finance.hf.space'}),'https://finance.example.com');
 assert.equal(publicOrigin({RENDER_EXTERNAL_URL:'https://finance.onrender.com',SPACE_HOST:'investor-finance.hf.space'}),'https://finance.onrender.com');
 for(const host of ['https://investor-finance.hf.space','x.hf.space:443','u:p@x.hf.space','x.hf.space/path','x.example.com','x.hf.space.evil.example'])assert.throws(()=>publicOrigin({SPACE_HOST:host}),/SPACE_HOST/);
 assert.equal(publicOrigin({}),null);
});
test('Space配置支持生产启动和外部HF主机名，原有安全Cookie和同源保护生效',async t=>{
 const directory=await mkdtemp(tmpdir()+'/finance-hf-');
 const site=await startPublicServer({port:0,host:'127.0.0.1',directory,config:{NODE_ENV:'production',SPACE_HOST:'investor-finance.hf.space'}});
 t.after(async()=>{await site.close();await rm(directory,{recursive:true,force:true})});
 const base='http://127.0.0.1:'+site.port;
 const post=(origin,body)=>new Promise((resolve,reject)=>{const req=httpRequest(base+'/api/auth/register',{method:'POST',headers:{Host:'investor-finance.hf.space',Origin:origin,'Content-Type':'application/json'}},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,cookie:res.headers['set-cookie']?.[0],body:JSON.parse(text)}))});req.on('error',reject);req.end(JSON.stringify(body))});
 const r=await post('https://investor-finance.hf.space',{username:'hf_investor',password:'test-password-2026',agreement:true});
 assert.equal(r.status,200);assert.match(r.cookie,/; Secure$/);assert.equal(r.body.user.role,'investor');
 const denied=await post('https://evil.example',{});assert.equal(denied.status,403);
});
