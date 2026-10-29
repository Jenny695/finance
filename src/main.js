import './style.css';
import './portal.css';
import './investor.css';
import {viewer,setViewer,isAdmin,requestJSON} from './session.js';
import {investorHome,mountHome,knowledgePage,profilePage,mountProfile,policyPage} from './investor-pages.js';
import {classifiedContent,mountClassified} from './classified-ui.js';
import {comparisonContent,mountComparison,methodologyContent,connectionContent,mountConnection,setInvestorIdentity} from './portal.js';
import {databaseContent,mountDatabase} from './database-ui.js';
import {publicProductContent,mountPublicProduct} from './public-library-ui.js';
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const logo=()=>`<a class="investor-logo" href="#/"><span>知</span><div><b>知衡</b><small>ZHIHENG FINANCE</small></div></a>`;
const risk='本平台仅基于公开数据客观整理分析，不构成任何投资建议，过往业绩不预示未来表现，投资有风险。';
const navs=[['/','首页'],['/analysis','产品查询'],['/compare','产品对比'],['/knowledge','投资知识'],['/profile','个人中心']];
let cleanup=null,ready=false,pending='/';
const route=()=>location.hash.slice(1)||'/';
function navigate(path){if(route()===path)render();else location.hash=path}
function shell(content,active){const user=viewer();document.getElementById('app').innerHTML=`<aside class="sidebar">${logo()}<nav class="investor-nav" aria-label="主导航">${[...navs,...(isAdmin()?[['/database','数据管理'],['/connection','服务设置']]:[])].map(([url,label])=>`<a href="#${url}" class="nav-item ${url===active?'active':''}" ${url===active?'aria-current="page"':''}><span>${label}</span></a>`).join('')}</nav><div class="sidebar-foot"><p>让信息更清楚，让判断更从容。</p></div></aside><div class="workspace"><header class="topbar"><button class="mobile-menu" data-action="menu" aria-label="打开导航">☰</button><span class="investor-breadcrumb">${navs.find(x=>x[0]===active)?.[1]||'工作台'}</span><a class="user-button" href="#/profile"><span class="avatar">${e(user.displayName.slice(0,1))}</span><span>${e(user.displayName)}</span></a></header><main class="content">${content}</main><footer class="risk-bar"><span>${risk}</span></footer></div>`}
function authPage(register=false){document.getElementById('app').innerHTML=`<main class="investor-auth"><section class="auth-story">${logo()}<div><p>理解风险 · 理性投资</p><h1>每一份投资，<br>都值得看得更清楚。</h1><h2>收益、风险与成本，放在一起看。</h2><div class="auth-values"><span>数据有来源</span><span>分析可解释</span><span>判断有依据</span></div></div><small>${risk}</small></section><section class="auth-entry"><div class="auth-card"><div class="auth-tabs"><a href="#/login" class="${register?'':'active'}">登录</a><a href="#/register" class="${register?'active':''}">注册</a></div><h2>${register?'创建你的知衡账户':'欢迎回到知衡'}</h2><p>${register?'开始建立自己的投资研究记录。':'继续查看产品和你的研究记录。'}</p><form id="auth-form" data-register="${register}"><label>账号<input name="username" autocomplete="username" minlength="3" maxlength="32" pattern="[a-zA-Z0-9_]{3,32}" placeholder="3—32位字母、数字或下划线" required></label>${register?'<label>昵称<input name="displayName" maxlength="24" placeholder="你的称呼" required></label>':''}<label>密码<input type="password" name="password" autocomplete="${register?'new-password':'current-password'}" minlength="8" maxlength="128" placeholder="${register?'设置至少8位密码':'输入密码'}" required></label>${register?'<label class="auth-agreement"><input type="checkbox" name="agreement" required><span>我已阅读并同意<a href="#/terms">使用条款</a>和<a href="#/privacy">隐私说明</a></span></label>':''}<p id="auth-error" class="auth-error" role="alert"></p><button class="p-primary" type="submit">${register?'注册并进入':'登录'}</button></form><p class="auth-switch">${register?'已有账户？<a href="#/login">去登录</a>':'还没有账户？<a href="#/register">立即注册</a>'}</p><p class="auth-risk">${risk}</p></div></section></main>`;
 document.getElementById('auth-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;document.getElementById('auth-error').textContent='';try{const data=new FormData(form),input={username:data.get('username'),password:data.get('password'),...(register?{displayName:data.get('displayName'),agreement:data.get('agreement')==='on'}:{})};const result=await requestJSON(register?'/api/auth/register':'/api/auth/login',input);form.reset();setViewer(result.user);setInvestorIdentity(result.user.id);const destination=pending;pending='/';navigate(destination)}catch(error){if(document.getElementById('auth-error'))document.getElementById('auth-error').textContent=error.message}finally{if(button.isConnected)button.disabled=false}};
}
function render(){cleanup?.();cleanup=null;const path=route(),parsed=new URL(path,'http://internal'),base=parsed.pathname;if(!ready){document.getElementById('app').innerHTML='<div class="app-loading">正在加载知衡…</div>';return}if(base==='/privacy'||base==='/terms'){document.getElementById('app').innerHTML=`<main class="policy-shell">${logo()}${policyPage(base.slice(1))}</main>`;return}if(!viewer()){if(!['/login','/register'].includes(base)){pending=path;location.hash='/login';return}authPage(base==='/register');return}if(['/login','/register'].includes(base)){location.replace('#/');return}
 if(base==='/'){shell(investorHome(),'/');cleanup=mountHome()}
 else if(base==='/analysis'||base.startsWith('/analysis/')){let code='';try{code=base.startsWith('/analysis/')?decodeURIComponent(base.slice(10)):''}catch{}shell(classifiedContent(code,parsed.searchParams.get('category')||'bank'),'/analysis');cleanup=mountClassified();const search=parsed.searchParams.get('search');if(search){document.getElementById('ca-product-search').value=search;document.getElementById('ca-search-products').click()}}
 else if(base==='/compare'){shell(comparisonContent(),'/compare');cleanup=mountComparison()}
 else if(base==='/knowledge'){shell(knowledgePage(),'/knowledge')}
 else if(base==='/methodology'){shell(methodologyContent(),'/knowledge')}
 else if(base==='/profile'){shell(profilePage(),'/profile');cleanup=mountProfile()}
 else if(base.startsWith('/public-product/')){const code=decodeURIComponent(base.slice(16));shell(publicProductContent(code),'/analysis');cleanup=mountPublicProduct(code)}
 else if(isAdmin()&&base==='/database'){shell(databaseContent(),'/database');cleanup=mountDatabase()}
 else if(isAdmin()&&base==='/connection'){shell(connectionContent(),'/connection');cleanup=mountConnection()}
 else{location.replace('#/');return}window.scrollTo(0,0)
}
document.addEventListener('click',async event=>{const action=event.target.closest('[data-action]')?.dataset.action;if(action==='menu')document.querySelector('.sidebar')?.classList.toggle('open');if(action==='logout'){try{await requestJSON('/api/auth/logout',{});setViewer(null);setInvestorIdentity(null);pending='/';navigate('/login')}catch(error){alert(error.message)}}});
window.addEventListener('zh-session-expired',()=>{setViewer(null);pending=route();navigate('/login')});
window.addEventListener('hashchange',render);
render();requestJSON('/api/auth/session').then(data=>{setViewer(data.user);setInvestorIdentity(data.user?.id)}).catch(()=>setViewer(null)).finally(()=>{ready=true;render()});
