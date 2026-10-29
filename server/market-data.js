import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {digest} from './database.js';
import {validateSource} from '../lib/assessment.js';

// Shared official market observations only. Accounts, reports and investment plans never enter this cache.
export function createMarketData({directory,config,query,consume,clock=()=>Date.now()}){
 mkdirSync(directory,{recursive:true});
 const db=new DatabaseSync(join(directory,'market-data.sqlite'));
 db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS market_queries(key TEXT PRIMARY KEY,data TEXT NOT NULL,expires_at INTEGER NOT NULL)');
 const pending=new Map(),ttl=Math.min(3600,Math.max(60,Number(config.MARKET_CACHE_SECONDS)||900))*1000;
 async function read(plan,user){
  const key=digest({credential:config.IFIND_ACCESS_TOKEN||config.IFIND_REFRESH_TOKEN||'none',plan});
  const saved=db.prepare('SELECT data FROM market_queries WHERE key=? AND expires_at>?').get(key,clock());
  if(saved)return {...JSON.parse(saved.data),cacheHit:true};
  if(pending.has(key))return {...await pending.get(key),cacheHit:true};
  const task=(async()=>{
   consume(user.id);
   const result=await query(plan);
   if(validateSource(result?.source)&&Number(result?.data?.errorcode)===0){
    const value={source:result.source,data:result.data};
    db.prepare('DELETE FROM market_queries WHERE expires_at<=?').run(clock());
    db.prepare('INSERT OR REPLACE INTO market_queries VALUES(?,?,?)').run(key,JSON.stringify(value),clock()+ttl);
   }
   return result;
  })();pending.set(key,task);
  try{return {...await task,cacheHit:false}}finally{pending.delete(key)}
 }
 return {read,close:()=>db.close()};
}
