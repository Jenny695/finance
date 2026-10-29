import {CODE_PATTERN,INVESTOR_CATEGORIES} from '../lib/catalog.js';
let identity=null,items=[];
const key=()=>`zh-compare:${identity}`;
export function setInvestorIdentity(id){identity=id||null;items=[];if(identity)try{const value=JSON.parse(sessionStorage.getItem(key())||'[]');items=Array.isArray(value)?value.filter(p=>p&&CODE_PATTERN.test(p.code)&&Object.hasOwn(INVESTOR_CATEGORIES,p.category)&&p.mode!=='demo').slice(0,4):[]}catch{}}
export const comparisonItems=()=>items.map(x=>({...x}));
export function toggleComparison(product){const index=items.findIndex(p=>p.code===product.code);if(index>=0)items.splice(index,1);else{if(items.length>=4)throw Error('一次最多对比4只产品');if(!CODE_PATTERN.test(product.code)||!Object.hasOwn(INVESTOR_CATEGORIES,product.category))throw Error('产品信息无效');items.push({code:product.code,category:product.category})}if(identity)sessionStorage.setItem(key(),JSON.stringify(items));return items.some(p=>p.code===product.code)}
export function removeComparison(code){items=items.filter(p=>p.code!==code);if(identity)sessionStorage.setItem(key(),JSON.stringify(items))}

export function addComparison(product){const code=String(product.code??'').trim().toUpperCase();if(!CODE_PATTERN.test(code))throw Error('请输入完整产品代码（2—40位字母、数字或 . _ -）');if(!Object.hasOwn(INVESTOR_CATEGORIES,product.category))throw Error('请选择产品类别');const existing=items.find(p=>p.code===code);if(existing){if(existing.category!==product.category)throw Error('该代码已按其他类别加入，请先移除后重新选择');return false}toggleComparison({code,category:product.category});return true}
