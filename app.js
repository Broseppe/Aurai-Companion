const D = window.AURAI_DATA;
const APP_VERSION = '2.1.0';
const WIKI = 'https://outward.wiki.gg';
const WIKI_API = `${WIKI}/api.php`;
const IS_NATIVE = /AuraiAndroid/i.test(navigator.userAgent);
const IS_STANDALONE = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true || IS_NATIVE;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function readJSON(key, fallback){try{return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));}catch{return fallback;}}
const allowedRoutes = new Set(['home','recipes','pantry','wiki','guides','saved']);
const params = new URLSearchParams(location.search);
const initialRoute = allowedRoutes.has(params.get('route')) ? params.get('route') : 'home';
const state = {
  route: initialRoute,
  filter: 'All',
  query: '',
  wikiQuery: '',
  saved: new Set(readJSON('auraiSaved', [])),
  pantry: readJSON('auraiPantry', []),
  recentWiki: readJSON('auraiRecentWiki', [])
};
let deferredInstallPrompt = null;
let swRegistration = null;
let reloadingForUpdate = false;
let wikiAbort = null;
const app = $('#app');

function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function stripHTML(v=''){const t=document.createElement('textarea');t.innerHTML=String(v).replace(/<[^>]*>/g,' ');return t.value.replace(/\s+/g,' ').trim();}
function haptic(){if(navigator.vibrate) navigator.vibrate(8);}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(window._toastTimer);window._toastTimer=setTimeout(()=>t.classList.remove('show'),1800);}
function saveState(){localStorage.setItem('auraiSaved',JSON.stringify([...state.saved]));localStorage.setItem('auraiPantry',JSON.stringify(state.pantry));localStorage.setItem('auraiRecentWiki',JSON.stringify(state.recentWiki.slice(0,6)));}
function wikiURL(page){return `${WIKI}/wiki/${encodeURIComponent(page).replace(/%20/g,'_')}`;}
function openExternal(url){if(IS_NATIVE){location.href=url;}else{window.open(url,'_blank','noopener,noreferrer');}}
function iconFor(type){return type==='Alchemy'?'⚗️':type==='Cooking'?'🍲':'🛠️';}
function routeTitle(r){return ({home:'Home',recipes:'Recipes',pantry:'My Items',wiki:'Wiki Explorer',guides:'Field Guides',saved:'Saved'})[r] || 'Home';}

function recipeCard(r, match=false){
  return `<article class="recipe-card ${match?'match':''}" data-recipe="${esc(r.id)}">
    <div class="recipe-icon">${iconFor(r.type)}</div>
    <div class="card-main">
      <div class="card-title">${esc(r.name)} ×${esc(r.yield)}</div>
      <div class="meta"><span class="chip gold">${esc(r.type)}</span><span class="chip">${esc(r.station)}</span>${match?'<span class="chip green">Craftable now</span>':''}</div>
      <div class="ingredients">${r.ingredients.map(esc).join(' · ')}</div>
    </div>
    <button class="save-btn ${state.saved.has(r.id)?'saved':''}" data-save="${esc(r.id)}" aria-label="${state.saved.has(r.id)?'Remove saved recipe':'Save recipe'}">${state.saved.has(r.id)?'♥':'♡'}</button>
  </article>`;
}

function getRecipeList(){
  let list=D.recipes.filter(r=>state.filter==='All'||r.type===state.filter);
  const q=state.query.trim().toLowerCase();
  if(q) list=list.filter(r=>[r.name,r.type,r.station,...r.ingredients,...(r.tags||[])].join(' ').toLowerCase().includes(q));
  return list;
}

function home(){
  const featured=D.recipes.filter(r=>['bandages','campfire','bread','great-astral-b'].includes(r.id));
  return `<section class="hero">
    <div class="hero-kicker">Outward companion</div>
    <h1>Find the answer without leaving the adventure.</h1>
    <p>Fast crafting and alchemy references, inventory matching, practical guides and live Outward Wiki search in one phone-friendly companion.</p>
    <div class="hero-stats"><span class="hero-stat">Live wiki search</span><span class="hero-stat">Recipe matcher</span><span class="hero-stat">Saved on device</span></div>
    <div class="searchbox"><input id="homeSearch" placeholder="Search recipe or ingredient…" autocomplete="off"><button id="homeGo">Search</button></div>
  </section>
  <div class="section-head"><div><h2>Quick access</h2><p>Designed for one-handed use while playing</p></div></div>
  <div class="quick-grid">
    <button class="quick-card" data-go="recipes" data-filter="Alchemy"><span class="emoji">⚗️</span><span class="arrow">›</span><strong>Alchemy</strong><small>Potions, charges and alchemy recipes</small></button>
    <button class="quick-card" data-go="recipes" data-filter="Cooking"><span class="emoji">🍲</span><span class="arrow">›</span><strong>Cooking</strong><small>Campfire and Cooking Pot recipes</small></button>
    <button class="quick-card" data-go="pantry"><span class="emoji">🎒</span><span class="arrow">›</span><strong>What can I make?</strong><small>Match recipes against your carried items</small></button>
    <button class="quick-card" data-go="wiki"><span class="emoji">📖</span><span class="arrow">›</span><strong>Wiki Explorer</strong><small>Search items, enemies, quests and more online</small></button>
  </div>
  <div class="section-head"><div><h2>Useful recipes</h2><p>Common crafts kept instantly available</p></div><button data-go="recipes">View all</button></div>
  <div class="cards grid">${featured.map(recipeCard).join('')}</div>
  <div class="section-head"><div><h2>Need a tip?</h2><p>Short practical guidance without wiki digging</p></div><button data-go="guides">All guides</button></div>
  <div class="cards">${D.guides.slice(0,2).map(guideCard).join('')}</div>`;
}

function recipes(){
  return `<div class="page-title"><h1>Recipes</h1><p>Quick-reference recipes stay fast on your device. Use Wiki Explorer for the full online Outward reference.</p></div>
  <div class="toolbar"><input id="recipeSearch" value="${esc(state.query)}" placeholder="Search recipe, ingredient or effect"></div>
  <div class="filter-row">${['All','Survival','Cooking','Alchemy'].map(x=>`<button data-filter="${x}" class="${state.filter===x?'active':''}">${x}</button>`).join('')}</div>
  <div class="notice"><strong>Experiment carefully:</strong> failed Cooking creates Food Waste, while a failed Alchemy combination destroys the ingredients. Survival crafting is safer to experiment with.</div>
  <div class="cards" id="recipeList">${recipeListHTML()}</div>`;
}
function recipeListHTML(){const list=getRecipeList();return list.length?list.map(recipeCard).join(''):'<div class="empty">No quick-reference match. Search the full wiki from Wiki Explorer.</div>';}

function pantry(){
  const canon=x=>String(x).toLowerCase().replace(/\s+/g,' ').trim();
  const own={};state.pantry.forEach(i=>own[canon(i)]=(own[canon(i)]||0)+1);
  const matches=D.recipes.filter(r=>{const need={};r.ingredients.forEach(i=>need[canon(i)]=(need[canon(i)]||0)+1);return Object.entries(need).every(([k,n])=>(own[k]||0)>=n);});
  const groups={};state.pantry.forEach((item,i)=>{const k=canon(item);if(!groups[k])groups[k]={name:item,count:0,index:i};groups[k].count++;groups[k].index=i;});
  return `<div class="page-title"><h1>My Items</h1><p>Add ingredients you are carrying. The matcher handles duplicate ingredients correctly.</p></div>
  <div class="pantry-add"><input id="pantryInput" list="ingredientHints" placeholder="Add ingredient e.g. Linen Cloth"><button class="primary-btn" id="pantryAdd">Add</button></div>
  <datalist id="ingredientHints">${[...new Set(D.recipes.flatMap(r=>r.ingredients))].sort().map(i=>`<option value="${esc(i)}">`).join('')}</datalist>
  <div class="pantry-list">${state.pantry.length?Object.values(groups).map(g=>`<span class="pantry-pill">${esc(g.name)}${g.count>1?` ×${g.count}`:''}<button data-remove-pantry="${g.index}" aria-label="Remove one ${esc(g.name)}">×</button></span>`).join(''):'<span class="chip">No items added yet</span>'}</div>
  <div class="section-head"><div><h2>Craftable now</h2><p>${matches.length} quick-reference recipe${matches.length===1?'':'s'} matched</p></div>${state.pantry.length?'<button id="clearPantry">Clear</button>':''}</div>
  <div class="cards">${matches.length?matches.map(r=>recipeCard(r,true)).join(''):'<div class="empty">Add ingredients above to see what you can make.</div>'}</div>`;
}

function guideCard(g){return `<article class="guide-card"><h3>${g.icon} ${esc(g.title)}</h3><p>${esc(g.text)}</p>${g.points?.length?`<ul>${g.points.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>`:''}</article>`;}
function guides(){return `<div class="page-title"><h1>Field Guides</h1><p>Concise practical notes for decisions you commonly make during a run.</p></div><div class="cards">${D.guides.map(guideCard).join('')}</div><div class="notice" style="margin-top:14px">For detailed mechanics and edge cases, use Wiki Explorer to open the relevant current Outward Wiki article.</div>`;}
function saved(){const list=D.recipes.filter(r=>state.saved.has(r.id));return `<div class="page-title"><h1>Saved</h1><p>Favourite recipes are kept locally on this device.</p></div><div class="cards">${list.length?list.map(recipeCard).join(''):'<div class="empty">Tap ♡ on a recipe to keep it here.</div>'}</div>`;}

const wikiAreas=[
  ['⚗️','Alchemy','Alchemy'],['🍲','Cooking','Cooking'],['⚔️','Weapons','Weapons'],['🛡️','Equipment','Equipment'],['👹','Enemies','Enemies'],['🗺️','Locations','Locations'],['📜','Quests','Quests'],['✨','Skills','Skills'],['🔮','Enchantments','Enchantments']
];
function wiki(){
  return `<div class="page-title"><h1>Wiki Explorer</h1><p>Search the current Outward Wiki from inside the companion. Results are fetched online rather than stored as a large offline database.</p></div>
  <div class="searchbox"><input id="wikiSearch" value="${esc(state.wikiQuery)}" placeholder="Potion, enemy, quest, item…"><button id="wikiGo">Search</button></div>
  <div class="wiki-categories">${wikiAreas.map(a=>`<button data-wiki-page="${esc(a[2])}"><b>${a[0]}</b><span>${esc(a[1])}</span></button>`).join('')}</div>
  <div class="notice"><strong>Online feature:</strong> Wiki Explorer needs internet. If the live API is unavailable, Aurai Companion will offer a direct wiki search instead.</div>
  <div id="wikiResults" class="cards">${recentWikiHTML()}</div>`;
}
function recentWikiHTML(){if(!state.recentWiki.length)return '<div class="empty">Search above, or choose a category to jump into the wiki.</div>';return `<div class="section-head" style="margin-top:2px"><div><h2>Recent lookups</h2><p>Stored only on this device</p></div></div>${state.recentWiki.map((q,i)=>`<article class="wiki-card" data-recent-wiki="${esc(q)}"><div class="wiki-index">${i+1}</div><a href="#"><h3>${esc(q)}</h3><p>Search the Outward Wiki again</p></a></article>`).join('')}`;}

function render(){
  const views={home,recipes,pantry,wiki,guides,saved};
  app.innerHTML=(views[state.route]||home)();
  app.setAttribute('aria-label',routeTitle(state.route));
  $$('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.route===state.route));
  renderDrawer();
  bindView();
}

function renderDrawer(){
  const nav=$('#drawerNav');
  nav.innerHTML=[['home','⌂','Home'],['recipes','⚗','Recipes'],['pantry','🎒','My Items'],['wiki','📖','Wiki Explorer'],['guides','✦','Field Guides'],['saved','♡','Saved']].map(([r,i,n])=>`<button data-drawer-route="${r}" class="${state.route===r?'active':''}">${i}&nbsp;&nbsp;${n}</button>`).join('');
  $$('[data-drawer-route]').forEach(b=>b.onclick=()=>setRoute(b.dataset.drawerRoute));
}

function setRoute(route, push=true){
  if(!allowedRoutes.has(route)) route='home';
  state.route=route;closeDrawer();closeSheet();haptic();render();
  if(push && location.protocol!=='file:'){
    const u=new URL(location.href);if(route==='home')u.searchParams.delete('route');else u.searchParams.set('route',route);history.pushState({route},'',u);
  }
  requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'smooth'}));
}

function bindRecipeCards(root=document){
  root.querySelectorAll('[data-recipe]').forEach(el=>el.onclick=e=>{if(e.target.closest('[data-save]'))return;openRecipe(el.dataset.recipe);});
  root.querySelectorAll('[data-save]').forEach(el=>el.onclick=e=>{e.stopPropagation();toggleSave(el.dataset.save);});
}
function bindView(){
  $$('[data-go]').forEach(el=>el.onclick=()=>{if(el.dataset.filter)state.filter=el.dataset.filter;setRoute(el.dataset.go);});
  $$('[data-filter]').forEach(el=>el.onclick=()=>{state.filter=el.dataset.filter;render();});
  bindRecipeCards();
  const rs=$('#recipeSearch');if(rs)rs.oninput=e=>{state.query=e.target.value;const list=$('#recipeList');list.innerHTML=recipeListHTML();bindRecipeCards(list);};
  const hs=$('#homeSearch'),hg=$('#homeGo');if(hg)hg.onclick=()=>{state.query=hs.value;state.filter='All';setRoute('recipes');};if(hs)hs.onkeydown=e=>{if(e.key==='Enter')hg.click();};
  const pa=$('#pantryAdd'),pi=$('#pantryInput');if(pa)pa.onclick=()=>addPantry(pi.value);if(pi)pi.onkeydown=e=>{if(e.key==='Enter')pa.click();};
  $$('[data-remove-pantry]').forEach(b=>b.onclick=()=>{state.pantry.splice(+b.dataset.removePantry,1);saveState();haptic();render();});
  const cp=$('#clearPantry');if(cp)cp.onclick=()=>{state.pantry=[];saveState();render();toast('Items cleared');};
  const wg=$('#wikiGo'),ws=$('#wikiSearch');if(wg)wg.onclick=()=>searchWiki(ws.value);if(ws)ws.onkeydown=e=>{if(e.key==='Enter')wg.click();};
  $$('[data-wiki-page]').forEach(b=>b.onclick=()=>openExternal(wikiURL(b.dataset.wikiPage)));
  $$('[data-recent-wiki]').forEach(c=>c.onclick=e=>{e.preventDefault();searchWiki(c.dataset.recentWiki);});
}

function addPantry(value){const v=String(value||'').trim();if(!v)return toast('Enter an ingredient');state.pantry.push(v);saveState();haptic();render();requestAnimationFrame(()=>$('#pantryInput')?.focus());}
function toggleSave(id){if(state.saved.has(id)){state.saved.delete(id);toast('Removed from saved');}else{state.saved.add(id);toast('Saved recipe');}saveState();haptic();render();}

function showSheet(html){$('#infoSheetContent').innerHTML=html;$('#infoSheet').classList.add('open');$('#infoSheet').setAttribute('aria-hidden','false');$('#sheetBackdrop').classList.add('show');document.body.style.overflow='hidden';}
function closeSheet(){$('#infoSheet').classList.remove('open');$('#infoSheet').setAttribute('aria-hidden','true');$('#sheetBackdrop').classList.remove('show');document.body.style.overflow='';}
function openRecipe(id){
  const r=D.recipes.find(x=>x.id===id);if(!r)return;
  showSheet(`<div class="detail-head"><div><div class="hero-kicker">${esc(r.type)} · ${esc(r.station)}</div><h2>${esc(r.name)}</h2><div class="meta"><span class="chip gold">Makes ${esc(r.yield)}</span>${(r.tags||[]).slice(0,3).map(t=>`<span class="chip">${esc(t)}</span>`).join('')}</div></div></div>
    <div class="detail-block"><h3>Ingredients</h3><div class="ingredient-list">${countIngredients(r.ingredients).map(([name,count])=>`<div class="ingredient-row"><span>${esc(name)}</span><strong>×${count}</strong></div>`).join('')}</div></div>
    ${r.note?`<div class="detail-block"><h3>Quick note</h3><div class="notice">${esc(r.note)}</div></div>`:''}
    <div class="actions"><button class="secondary-btn" id="sheetSave">${state.saved.has(r.id)?'♥ Saved':'♡ Save'}</button><button class="primary-btn" id="sheetWiki">Open Wiki</button></div>
    ${navigator.share?'<div class="actions"><button class="secondary-btn" id="sheetShare">Share recipe</button></div>':''}`);
  $('#sheetSave').onclick=()=>{toggleSave(r.id);closeSheet();};
  $('#sheetWiki').onclick=()=>openExternal(wikiURL(r.wiki||r.name));
  const share=$('#sheetShare');if(share)share.onclick=async()=>{try{await navigator.share({title:`${r.name} — Aurai Companion`,text:`${r.name}: ${r.ingredients.join(', ')}`,url:wikiURL(r.wiki||r.name)});}catch{}};
}
function countIngredients(items){const map=new Map();for(const item of items)map.set(item,(map.get(item)||0)+1);return [...map.entries()];}

async function searchWiki(raw){
  const q=String(raw||'').trim();if(!q)return toast('Enter something to search');
  state.wikiQuery=q;state.recentWiki=[q,...state.recentWiki.filter(x=>x.toLowerCase()!==q.toLowerCase())].slice(0,6);saveState();
  const target=$('#wikiResults');if(!target)return;
  target.innerHTML='<div class="wiki-status"><div class="spinner"></div>Searching Outward Wiki…</div>';
  wikiAbort?.abort();wikiAbort=new AbortController();
  try{
    const url=`${WIKI_API}?action=query&format=json&origin=*&list=search&srlimit=12&srnamespace=0&srsearch=${encodeURIComponent(q)}`;
    const res=await fetch(url,{signal:wikiAbort.signal,headers:{'Accept':'application/json'}});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();const results=data?.query?.search||[];
    if(!results.length){target.innerHTML=`<div class="empty">No live results for “${esc(q)}”. <button class="link-btn" id="wikiFallback">Open wiki search</button></div>`;$('#wikiFallback').onclick=()=>openExternal(`${WIKI}/index.php?search=${encodeURIComponent(q)}`);return;}
    target.innerHTML=results.map((r,i)=>`<article class="wiki-card" data-wiki-url="${esc(wikiURL(r.title))}"><div class="wiki-index">${i+1}</div><a href="#"><h3>${esc(r.title)}</h3><p>${esc(stripHTML(r.snippet)||'Open this article on the Outward Wiki.')}</p></a></article>`).join('');
    $$('[data-wiki-url]').forEach(c=>c.onclick=e=>{e.preventDefault();openExternal(c.dataset.wikiUrl);});
  }catch(err){
    if(err.name==='AbortError')return;
    target.innerHTML=`<div class="empty">Live lookup could not connect. <button class="link-btn" id="wikiFallback">Search outward.wiki.gg directly</button></div>`;
    $('#wikiFallback').onclick=()=>openExternal(`${WIKI}/index.php?search=${encodeURIComponent(q)}`);
  }
}

function openDrawer(){$('#drawer').classList.add('open');$('#drawer').setAttribute('aria-hidden','false');$('#backdrop').classList.add('show');}
function closeDrawer(){$('#drawer').classList.remove('open');$('#drawer').setAttribute('aria-hidden','true');$('#backdrop').classList.remove('show');}

function installSheetHTML(){
  if(IS_NATIVE)return `<div class="install-card"><img src="icon.svg" alt=""><h2>Aurai Companion</h2><p>You are using the Android app build.</p><div class="install-steps"><div><span class="step-num">✓</span><span>Installed as a native Android WebView app.</span></div><div><span class="step-num">✓</span><span>Live wiki searches use your internet connection.</span></div></div><small>Version ${APP_VERSION}</small></div>`;
  if(IS_STANDALONE)return `<div class="install-card"><img src="icon.svg" alt=""><h2>Already installed</h2><p>Aurai Companion is running in standalone app mode.</p><div class="install-steps"><div><span class="step-num">✓</span><span>Launch it from your home screen or app drawer.</span></div><div><span class="step-num">✓</span><span>Updates are checked when the app opens.</span></div></div><small>Version ${APP_VERSION}</small></div>`;
  if(deferredInstallPrompt)return `<div class="install-card"><img src="icon.svg" alt=""><h2>Install Aurai Companion</h2><p>Add it to this phone so it opens like a normal app.</p><div class="install-steps"><div><span class="step-num">1</span><span>Tap <strong>Install now</strong>.</span></div><div><span class="step-num">2</span><span>Confirm the browser install prompt.</span></div><div><span class="step-num">3</span><span>Open Aurai from your home screen or app drawer.</span></div></div><button class="primary-btn" id="installNow" style="width:100%">Install now</button></div>`;
  const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  return `<div class="install-card"><img src="icon.svg" alt=""><h2>Install on this phone</h2><p>${isiOS?'Safari installs web apps from the Share menu.':'Your browser can add Aurai Companion to the home screen once it is opened from its hosted HTTPS address.'}</p><div class="install-steps">${isiOS?'<div><span class="step-num">1</span><span>Open this page in Safari.</span></div><div><span class="step-num">2</span><span>Tap Share, then <strong>Add to Home Screen</strong>.</span></div><div><span class="step-num">3</span><span>Tap Add.</span></div>':'<div><span class="step-num">1</span><span>Open the browser menu (⋮).</span></div><div><span class="step-num">2</span><span>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</span></div><div><span class="step-num">3</span><span>Confirm installation.</span></div>'}</div><small>Version ${APP_VERSION}</small></div>`;
}
function showInstallSheet(){showSheet(installSheetHTML());const btn=$('#installNow');if(btn)btn.onclick=async()=>{try{await deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;closeSheet();}catch{toast('Install prompt unavailable');}};}

function updateNetworkLabel(){const l=$('#networkLabel');if(!l)return;if(navigator.onLine){l.textContent='Online · live wiki ready';l.className='online';}else{l.textContent='Offline · quick reference only';l.className='offline';}}
function showUpdate(){const bar=$('#updateBar');bar.hidden=false;}
async function checkForUpdate(){if(!swRegistration)return toast(IS_NATIVE?'Android updates come from your APK source':'Update checks need the hosted web version');try{await swRegistration.update();toast(swRegistration.waiting?'Update ready':'You’re up to date');if(swRegistration.waiting)showUpdate();}catch{toast('Could not check for updates');}}

function registerServiceWorker(){
  if(!('serviceWorker' in navigator)||!/^https?:$/.test(location.protocol))return;
  navigator.serviceWorker.register('./sw.js').then(reg=>{
    swRegistration=reg;if(reg.waiting)showUpdate();
    reg.addEventListener('updatefound',()=>{const worker=reg.installing;if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)showUpdate();});});
  }).catch(()=>{});
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloadingForUpdate)return;reloadingForUpdate=true;location.reload();});
}

$('#menuBtn').onclick=openDrawer;$('#backdrop').onclick=closeDrawer;$('#brandHome').onclick=()=>setRoute('home');$('#installBtn').onclick=showInstallSheet;$('#drawerInstall').onclick=()=>{closeDrawer();showInstallSheet();};$('#drawerUpdate').onclick=()=>{closeDrawer();checkForUpdate();};$('#sheetBackdrop').onclick=closeSheet;$$('[data-close-sheet]').forEach(b=>b.onclick=closeSheet);$('#applyUpdate').onclick=()=>{if(swRegistration?.waiting)swRegistration.waiting.postMessage({type:'SKIP_WAITING'});else location.reload();};
$$('.bottom-nav button').forEach(b=>b.onclick=()=>setRoute(b.dataset.route));
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('#installBtn').hidden=false;});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;toast('Aurai Companion installed');});
window.addEventListener('online',updateNetworkLabel);window.addEventListener('offline',updateNetworkLabel);
window.addEventListener('popstate',e=>{const u=new URL(location.href);const r=e.state?.route||u.searchParams.get('route')||'home';state.route=allowedRoutes.has(r)?r:'home';render();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDrawer();closeSheet();}});

updateNetworkLabel();render();registerServiceWorker();
setTimeout(()=>$('#splash')?.classList.add('hide'),520);
