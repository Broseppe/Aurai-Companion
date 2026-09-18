const D = window.AURAI_DATA;
const APP_VERSION = '2.3.1';
const WIKI = 'https://outward.wiki.gg';
const WIKI_API = `${WIKI}/api.php`;
const IS_NATIVE = /AuraiAndroid/i.test(navigator.userAgent);
const IS_STANDALONE = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true || IS_NATIVE;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const DB_NAME = 'aurai-companion';
const DB_VERSION = 1;
const DB_STORE = 'cache';
const RECIPE_CACHE_KEY = 'wikiRecipeIndex';
const SYNC_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function readJSON(key, fallback){try{return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));}catch{return fallback;}}
function canon(v=''){return String(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’‘]/g,"'").replace(/[^a-z0-9' -]+/g,' ').replace(/\s+/g,' ').trim();}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function stripHTML(v=''){const t=document.createElement('textarea');t.innerHTML=String(v).replace(/<[^>]*>/g,' ');return t.value.replace(/\s+/g,' ').trim();}
function haptic(){if(navigator.vibrate) navigator.vibrate(8);}
function toast(msg){const t=$('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(window._toastTimer);window._toastTimer=setTimeout(()=>t.classList.remove('show'),1900);}
function wikiURL(page){return `${WIKI}/wiki/${encodeURIComponent(page).replace(/%20/g,'_')}`;}
function openExternal(url){if(IS_NATIVE){location.href=url;}else{window.open(url,'_blank','noopener,noreferrer');}}
function iconFor(type){return type==='Alchemy'?'⚗️':type==='Cooking'?'🍲':type==='Crafting'?'🔨':'🛠️';}
function routeTitle(r){return ({home:'Home',recipes:'Recipes',pantry:'My Items',shopping:'Shopping List',compare:'Compare Recipes',wiki:'Wiki Explorer',guides:'Field Guides',saved:'Saved'})[r] || 'Home';}
function countIngredients(items){const map=new Map();for(const item of items)map.set(item,(map.get(item)||0)+1);return [...map.entries()];}
function ingredientCountMap(items){const map={};for(const item of items){const k=canon(item);map[k]=(map[k]||0)+1;}return map;}
function hashString(value){let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
function formatDate(ts){if(!ts)return 'Not synced yet';try{return new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric'}).format(new Date(ts));}catch{return new Date(ts).toLocaleDateString();}}

let catalogRecipes = D.recipes.map(r=>({...r,source:'bundled'}));
let ingredientNames = [];
let ingredientByKey = new Map();
let dbConnection = null;

const allowedRoutes = new Set(['home','recipes','pantry','shopping','compare','wiki','guides','saved']);
const params = new URLSearchParams(location.search);
const initialRoute = allowedRoutes.has(params.get('route')) ? params.get('route') : 'home';
const state = {
  route: initialRoute,
  filter: 'All',
  purpose: 'All',
  query: '',
  pantryQuery: '',
  ingredientQuery: '',
  wikiQuery: '',
  saved: new Set(readJSON('auraiSaved', [])),
  pantry: readJSON('auraiPantry', []),
  plan: new Set(readJSON('auraiPlan', [])),
  loadouts: readJSON('auraiLoadouts', []),
  recentWiki: readJSON('auraiRecentWiki', []),
  compareA: readJSON('auraiCompareA', ''),
  compareB: readJSON('auraiCompareB', ''),
  dbSource: 'bundled',
  dbUpdatedAt: 0,
  dbSyncing: false,
  dbError: ''
};

let deferredInstallPrompt = null;
let swRegistration = null;
let reloadingForUpdate = false;
let wikiAbort = null;
const app = $('#app');

const PURPOSES = {
  All: [],
  Healing: ['heal','health','bandage','life potion'],
  Mana: ['mana','astral'],
  Stamina: ['stamina','endurance','able tea'],
  Weather: ['warm','cool','cold','hot','weather'],
  Combat: ['damage','imbue','varnish','rage','discipline','ammo','bomb','charge','rag'],
  Travel: ['travel','ration'],
  Food: ['food','drink','tea','stew','jerky','sandwich','cake','tartine']
};

// Known ingredient-family substitutions that are explicitly useful in Outward.
// This is deliberately conservative: exact ingredients are always preferred.
const FULFILLS = {
  'raw meat': ['meat','ration ingredient'],
  'clean water': ['water']
};
const GENERIC_INGREDIENTS = new Set(['meat','ration ingredient','water','bread','egg','fish','mushroom','vegetable','basic armor','basic boots','basic helm']);

function saveState(){
  localStorage.setItem('auraiSaved',JSON.stringify([...state.saved]));
  localStorage.setItem('auraiPantry',JSON.stringify(state.pantry));
  localStorage.setItem('auraiPlan',JSON.stringify([...state.plan]));
  localStorage.setItem('auraiLoadouts',JSON.stringify(state.loadouts));
  localStorage.setItem('auraiRecentWiki',JSON.stringify(state.recentWiki.slice(0,6)));
  localStorage.setItem('auraiCompareA',JSON.stringify(state.compareA||''));
  localStorage.setItem('auraiCompareB',JSON.stringify(state.compareB||''));
}

function rebuildIngredientIndex(){
  ingredientNames=[...new Set(catalogRecipes.flatMap(r=>r.ingredients).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  ingredientByKey=new Map(ingredientNames.map(i=>[canon(i),i]));
}
rebuildIngredientIndex();

function recipeSignature(r){
  const parts=countIngredients(r.ingredients||[]).map(([n,c])=>`${canon(n)}:${c}`).sort();
  return `${canon(r.name)}|${canon(r.station)}|${parts.join('|')}`;
}
function getRecipe(id){return catalogRecipes.find(r=>r.id===id) || D.recipes.find(r=>r.id===id);}
function classifyStation(station='None'){
  const s=canon(station);
  if(s.includes('alchemy'))return 'Alchemy';
  if(s.includes('cooking')||s.includes('campfire')||s.includes('kitchen'))return 'Cooking';
  if(!s||s==='none')return 'Survival';
  return 'Crafting';
}
function cleanCargoValue(value){
  if(value==null)return '';
  return String(value).replace(/\[\[(?:[^|\]]+\|)?([^\]]+)\]\]/g,'$1').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').trim();
}
function remoteRecipeFromRow(row){
  const t=row?.title||row||{};
  const page=cleanCargoValue(t._pageName||t.page||t.name);
  const name=cleanCargoValue(t.name)||page;
  const station=cleanCargoValue(t.station)||'None';
  const ingredients=['ingredient1','ingredient2','ingredient3','ingredient4'].map(k=>cleanCargoValue(t[k])).filter(Boolean);
  if(!name||!ingredients.length)return null;
  const count=Math.max(1,parseInt(cleanCargoValue(t.count),10)||1);
  const base={name,type:classifyStation(station),station,yield:count,ingredients,tags:[],note:'',wiki:page||name,source:'wiki-index'};
  return {...base,id:`wiki-${hashString(`${recipeSignature(base)}|${canon(page)}`)}`};
}
function mergeCatalog(remote){
  const curated=D.recipes.map(r=>({...r,source:'bundled'}));
  const seen=new Set(curated.map(recipeSignature));
  const out=[...curated];
  for(const recipe of remote||[]){
    if(!recipe?.ingredients?.length)continue;
    const sig=recipeSignature(recipe);
    if(seen.has(sig))continue;
    seen.add(sig);out.push(recipe);
  }
  out.sort((a,b)=>a.type.localeCompare(b.type)||a.name.localeCompare(b.name)||a.station.localeCompare(b.station));
  return out;
}
function applyRemoteCatalog(remote,updatedAt=Date.now()){
  catalogRecipes=mergeCatalog(remote);
  state.dbSource=remote?.length?'wiki-cache':'bundled';
  state.dbUpdatedAt=updatedAt||0;
  state.dbError='';
  rebuildIngredientIndex();
}

function openDB(){
  if(dbConnection)return Promise.resolve(dbConnection);
  if(!('indexedDB' in window))return Promise.reject(new Error('IndexedDB unavailable'));
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE,{keyPath:'key'});};
    req.onsuccess=()=>{dbConnection=req.result;resolve(dbConnection);};
    req.onerror=()=>reject(req.error||new Error('Could not open offline database'));
  });
}
async function dbGet(key){
  const db=await openDB();
  return new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readonly');const req=tx.objectStore(DB_STORE).get(key);req.onsuccess=()=>resolve(req.result?.value||null);req.onerror=()=>reject(req.error);});
}
async function dbPut(key,value){
  const db=await openDB();
  return new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put({key,value});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
}
async function loadCachedRecipeDatabase(){
  try{
    const cached=await dbGet(RECIPE_CACHE_KEY);
    if(cached?.recipes?.length){
      applyRemoteCatalog(cached.recipes,cached.updatedAt);
      render();
      return cached;
    }
  }catch{}
  return null;
}
async function fetchWikiRecipeIndex(){
  let all=[];let offset=0;const limit=500;
  for(let page=0;page<5;page++){
    const q=new URLSearchParams({
      action:'cargoquery',format:'json',origin:'*',tables:'ItemRecipes',
      fields:'_pageName,name,count,ingredient1,ingredient2,ingredient3,ingredient4,station',
      limit:String(limit),offset:String(offset)
    });
    const res=await fetch(`${WIKI_API}?${q.toString()}`,{headers:{Accept:'application/json'}});
    if(!res.ok)throw new Error(`Wiki recipe index returned HTTP ${res.status}`);
    const data=await res.json();
    if(data?.error)throw new Error(data.error.info||'Wiki recipe index unavailable');
    const batch=(data?.cargoquery||[]).map(remoteRecipeFromRow).filter(Boolean);
    all.push(...batch);
    if((data?.cargoquery||[]).length<limit)break;
    offset+=limit;
  }
  const unique=[];const seen=new Set();
  for(const r of all){const sig=recipeSignature(r);if(!seen.has(sig)){seen.add(sig);unique.push(r);}}
  if(unique.length<50)throw new Error('Wiki returned an incomplete recipe index');
  return unique;
}
async function syncRecipeDatabase({silent=false}={}){
  if(state.dbSyncing)return;
  if(!navigator.onLine){if(!silent)toast('Go online to refresh the recipe database');return;}
  state.dbSyncing=true;state.dbError='';render();
  try{
    const recipes=await fetchWikiRecipeIndex();
    const updatedAt=Date.now();
    await dbPut(RECIPE_CACHE_KEY,{recipes,updatedAt});
    applyRemoteCatalog(recipes,updatedAt);
    if(!silent)toast(`Recipe database ready · ${catalogRecipes.length} recipes`);
  }catch(err){
    state.dbError=err?.message||'Could not refresh the recipe database';
    if(!silent)toast('Could not refresh recipe database');
  }finally{state.dbSyncing=false;updateNetworkLabel();render();}
}
async function initRecipeDatabase(){
  const cached=await loadCachedRecipeDatabase();
  const stale=!cached?.updatedAt || Date.now()-cached.updatedAt>SYNC_MAX_AGE;
  if(navigator.onLine && stale)syncRecipeDatabase({silent:true});
}

function levenshtein(a,b){
  a=canon(a);b=canon(b);if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;
  const prev=Array.from({length:b.length+1},(_,i)=>i);const cur=new Array(b.length+1);
  for(let i=1;i<=a.length;i++){
    cur[0]=i;
    for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    for(let j=0;j<=b.length;j++)prev[j]=cur[j];
  }
  return prev[b.length];
}
function fuzzyTermMatch(term,haystack){
  term=canon(term);haystack=canon(haystack);if(!term)return true;if(haystack.includes(term))return true;
  const words=haystack.split(/\s+/).filter(Boolean);const max=term.length<=4?1:term.length<=8?2:3;
  return words.some(w=>Math.abs(w.length-term.length)<=max&&levenshtein(term,w)<=max);
}
function recipeHaystack(r){return [r.name,r.type,r.station,...(r.ingredients||[]),...(r.tags||[]),r.note||''].join(' ');}
function matchesTerms(r,raw){const terms=canon(raw).split(/[\s,;+]+/).filter(Boolean);if(!terms.length)return true;const hay=recipeHaystack(r);return terms.every(t=>fuzzyTermMatch(t,hay));}
function matchesPurpose(r,purpose){if(!purpose||purpose==='All')return true;const keys=PURPOSES[purpose]||[];const hay=canon(recipeHaystack(r));return keys.some(k=>hay.includes(canon(k)));}
function ingredientSearchMatches(raw,limit=8){
  const q=canon(raw);if(!q)return [];
  const scored=ingredientNames.map(name=>{
    const c=canon(name);let score=99;
    if(c===q)score=0;else if(c.startsWith(q))score=1;else if(c.includes(q))score=2;else{const d=levenshtein(q,c);const word=Math.min(...c.split(' ').map(w=>levenshtein(q,w)));score=3+Math.min(d,word);}
    return {name,score};
  }).filter(x=>x.score<=Math.max(5,Math.floor(q.length/2)+2)).sort((a,b)=>a.score-b.score||a.name.localeCompare(b.name));
  return scored.slice(0,limit);
}
function normalizeIngredient(value){
  const v=String(value||'').trim();if(!v)return '';
  const exact=ingredientByKey.get(canon(v));if(exact)return exact;
  const best=ingredientSearchMatches(v,1)[0];
  if(best && best.score<=5)return best.name;
  return v;
}
function fulfillsItem(owned,needed){
  const o=canon(owned),n=canon(needed);if(o===n)return true;
  return (FULFILLS[o]||[]).includes(n);
}
function pantryStatus(r,items=state.pantry){
  const available=items.map((name,i)=>({name,key:canon(name),i,used:false}));
  const needs=(r.ingredients||[]).map(name=>({name,key:canon(name),generic:GENERIC_INGREDIENTS.has(canon(name))})).sort((a,b)=>Number(a.generic)-Number(b.generic));
  let haveUnits=0;const missingNames=[];
  for(const need of needs){
    let idx=available.findIndex(x=>!x.used&&x.key===need.key);
    if(idx<0)idx=available.findIndex(x=>!x.used&&fulfillsItem(x.name,need.name));
    if(idx>=0){available[idx].used=true;haveUnits++;}else missingNames.push(need.name);
  }
  const missing=countIngredients(missingNames);const totalUnits=needs.length;const missingUnits=missingNames.length;
  return {craftable:missingUnits===0,haveUnits,totalUnits,missingUnits,missing,ratio:totalUnits?haveUnits/totalUnits:0};
}

function recipeCard(r,status=null){
  const craftable=status?.craftable;const partial=status&&!craftable&&status.haveUnits>0;
  const progress=craftable?'<span class="chip green">Craftable now</span>':partial?`<span class="chip amber">Have ${status.haveUnits}/${status.totalUnits}</span>`:'';
  const planned=state.plan.has(r.id)?'<span class="chip blue">Planned</span>':'';
  const missing=partial?`<div class="missing-line">Missing: ${status.missing.map(([n,c])=>`${esc(n)}${c>1?` ×${c}`:''}`).join(' · ')}</div>`:'';
  return `<article class="recipe-card ${craftable?'match':partial?'near-match':''}" data-recipe="${esc(r.id)}">
    <div class="recipe-icon">${iconFor(r.type)}</div><div class="card-main"><div class="card-title">${esc(r.name)} ×${esc(r.yield)}</div>
    <div class="meta"><span class="chip gold">${esc(r.type)}</span><span class="chip">${esc(r.station)}</span>${progress}${planned}</div>
    <div class="ingredients">${(r.ingredients||[]).map(esc).join(' · ')}</div>${missing}</div>
    <button class="save-btn ${state.saved.has(r.id)?'saved':''}" data-save="${esc(r.id)}" aria-label="${state.saved.has(r.id)?'Remove saved recipe':'Save recipe'}">${state.saved.has(r.id)?'♥':'♡'}</button>
  </article>`;
}
function getRecipeList(){
  let list=catalogRecipes.filter(r=>state.filter==='All'||r.type===state.filter);
  if(state.purpose!=='All')list=list.filter(r=>matchesPurpose(r,state.purpose));
  if(state.query.trim())list=list.filter(r=>matchesTerms(r,state.query));
  return list.slice().sort((a,b)=>a.name.localeCompare(b.name)||a.station.localeCompare(b.station));
}
function databaseStatusHTML(){
  const full=state.dbSource==='wiki-cache';const count=catalogRecipes.length;
  return `<div class="database-card ${full?'ready':''}"><div><strong>${full?'Offline recipe database ready':'Starter recipe set'}</strong><span>${count} recipes · ${full?`last synced ${formatDate(state.dbUpdatedAt)}`:'sync once to cache the wider wiki recipe index'}</span>${state.dbError?`<small>${esc(state.dbError)}</small>`:''}</div><button id="syncRecipes" ${state.dbSyncing?'disabled':''}>${state.dbSyncing?'Syncing…':full?'Refresh':'Sync database'}</button></div>`;
}

function home(){
  const featured=['bandages','campfire','bread','great-astral-b'].map(getRecipe).filter(Boolean);
  return `<section class="hero"><div class="hero-kicker">Outward companion</div><h1>Find the answer without leaving the adventure.</h1>
    <p>Recipes, alchemy, ingredient matching, shopping lists, practical guides and direct Outward Wiki lookup in one phone-friendly companion.</p>
    <div class="hero-stats"><span class="hero-stat">Offline recipe cache</span><span class="hero-stat">Ingredient matcher</span><span class="hero-stat">Saved on device</span></div>
    <div class="searchbox"><input id="homeSearch" placeholder="Search recipe or ingredients…" autocomplete="off"><button id="homeGo">Search</button></div></section>
  <div class="section-head"><div><h2>Quick access</h2><p>Useful while you are actually playing</p></div></div>
  <div class="quick-grid">
    <button class="quick-card" data-go="recipes" data-filter="Alchemy"><span class="emoji">⚗️</span><span class="arrow">›</span><strong>Alchemy</strong><small>Potions, charges and alchemy recipes</small></button>
    <button class="quick-card" data-go="recipes" data-filter="Cooking"><span class="emoji">🍲</span><span class="arrow">›</span><strong>Cooking</strong><small>Campfire and Cooking Pot recipes</small></button>
    <button class="quick-card" data-go="pantry"><span class="emoji">🎒</span><span class="arrow">›</span><strong>What can I make?</strong><small>Rank recipes from the ingredients you have</small></button>
    <button class="quick-card" data-go="shopping"><span class="emoji">🧾</span><span class="arrow">›</span><strong>Shopping list</strong><small>Combine missing ingredients for planned recipes</small></button>
    <button class="quick-card" data-go="compare"><span class="emoji">⚖️</span><span class="arrow">›</span><strong>Compare</strong><small>Compare two recipes side by side</small></button>
    <button class="quick-card" data-go="wiki"><span class="emoji">📖</span><span class="arrow">›</span><strong>Wiki Explorer</strong><small>Items, enemies, quests and detailed pages</small></button>
  </div>
  <div class="section-head"><div><h2>Useful recipes</h2><p>Common crafts kept instantly available</p></div><button data-go="recipes" data-filter="All">View all</button></div>
  <div class="cards grid">${featured.map(r=>recipeCard(r)).join('')}</div>
  <div class="section-head"><div><h2>Need a tip?</h2><p>Short practical guidance without wiki digging</p></div><button data-go="guides">All guides</button></div>
  <div class="cards">${D.guides.slice(0,2).map(guideCard).join('')}</div>`;
}
function recipes(){
  return `<div class="page-title"><h1>Recipes</h1><p>Search by name, ingredient, effect or purpose. Spelling does not need to be exact.</p></div>
  ${databaseStatusHTML()}
  <div class="toolbar"><input id="recipeSearch" value="${esc(state.query)}" placeholder="Try livweedy, water beetle, stamina…"></div>
  <div class="filter-label">Recipe type</div><div class="filter-row">${['All','Survival','Cooking','Alchemy','Crafting'].map(x=>`<button data-filter="${x}" class="${state.filter===x?'active':''}">${x}</button>`).join('')}</div>
  <div class="filter-label">Purpose</div><div class="filter-row purpose-row">${Object.keys(PURPOSES).map(x=>`<button data-purpose="${x}" class="${state.purpose===x?'active':''}">${x}</button>`).join('')}</div>
  <div class="notice"><strong>Start with ingredients instead:</strong> My Items ranks what you can make now and what only needs one or two more ingredients.</div>
  <div class="cards" id="recipeList">${recipeListHTML()}</div>`;
}
function recipeListHTML(){const list=getRecipeList();return list.length?list.map(r=>recipeCard(r)).join(''):'<div class="empty">No match. Try fewer words, another filter, or Wiki Explorer.</div>';}
function ingredientSuggestionHTML(raw){const list=ingredientSearchMatches(raw);return list.length?list.map(x=>`<button data-ingredient-suggestion="${esc(x.name)}"><strong>${esc(x.name)}</strong><small>tap to add</small></button>`).join(''):raw.trim()?'<span>No close ingredient names found — you can still add exactly what you typed.</span>':'';}

function loadoutsInlineHTML(){
  if(!state.loadouts.length)return '';
  return `<div class="loadout-strip">${state.loadouts.slice(0,5).map(l=>`<button data-load-loadout="${esc(l.id)}">${esc(l.name)} <small>${l.items.length}</small></button>`).join('')}</div>`;
}
function pantry(){
  const grouped={};state.pantry.forEach(item=>{const k=canon(item);if(!grouped[k])grouped[k]={key:k,name:ingredientByKey.get(k)||item,count:0};grouped[k].count++;});
  const statuses=catalogRecipes.map(r=>({r,s:pantryStatus(r)}));
  const filterByPantryQuery=x=>!state.pantryQuery.trim()||matchesTerms(x.r,state.pantryQuery);
  const craftable=statuses.filter(x=>x.s.craftable&&filterByPantryQuery(x)).sort((a,b)=>a.r.name.localeCompare(b.r.name));
  const close=statuses.filter(x=>!x.s.craftable&&x.s.haveUnits>0&&filterByPantryQuery(x)).sort((a,b)=>a.s.missingUnits-b.s.missingUnits||b.s.ratio-a.s.ratio||a.r.name.localeCompare(b.r.name));
  const common=['Water','Clean Water','Linen Cloth','Wood','Salt','Raw Meat','Thick Oil'].filter(x=>ingredientByKey.has(canon(x)));
  return `<div class="page-title"><h1>My Items</h1><p>Add what is in your bag. Aurai checks the offline recipe database and puts the closest recipes first.</p></div>
  <div class="pantry-action-row"><button id="saveLoadout" ${!state.pantry.length?'disabled':''}>Save loadout</button><button id="manageLoadouts">Loadouts ${state.loadouts.length?`(${state.loadouts.length})`:''}</button><button data-go="shopping">Shopping ${state.plan.size?`(${state.plan.size})`:''}</button></div>
  ${loadoutsInlineHTML()}
  <div class="pantry-add"><input id="pantryInput" placeholder="Add ingredient e.g. Livweedi" autocomplete="off"><button class="primary-btn" id="pantryAdd">Add</button></div>
  <div class="ingredient-suggestions" id="ingredientSuggestions"></div>
  ${!state.pantry.length&&common.length?`<div class="quick-ingredients"><span>Quick add</span>${common.map(i=>`<button data-quick-ingredient="${esc(i)}">+ ${esc(i)}</button>`).join('')}</div>`:''}
  <div class="pantry-list">${state.pantry.length?Object.values(grouped).map(g=>`<span class="pantry-pill"><button class="qty-btn" data-pantry-dec="${encodeURIComponent(g.key)}" aria-label="Remove one ${esc(g.name)}">−</button><button class="ingredient-name-btn" data-ingredient-open="${esc(g.name)}">${esc(g.name)}${g.count>1?` ×${g.count}`:''}</button><button class="qty-btn plus" data-pantry-inc="${encodeURIComponent(g.key)}" aria-label="Add another ${esc(g.name)}">+</button></span>`).join(''):'<span class="chip">No items added yet</span>'}</div>
  ${state.pantry.length?`<div class="pantry-tools"><input id="pantryRecipeSearch" value="${esc(state.pantryQuery)}" placeholder="Filter results…"><button id="clearPantry">Clear</button></div>`:''}
  ${state.pantry.length?`<div class="result-summary"><strong>${craftable.length}</strong> craftable now <span>·</span> <strong>${close.length}</strong> partial matches</div>`:'<div class="notice"><strong>Try it:</strong> add two or three ingredients. Near matches show exactly what you are missing.</div>'}
  ${state.pantry.length?`<div class="section-head"><div><h2>Craftable now</h2><p>Everything required is already in My Items</p></div></div><div class="cards">${craftable.length?craftable.slice(0,80).map(x=>recipeCard(x.r,x.s)).join(''):'<div class="empty">Nothing complete yet. The closest options are below.</div>'}</div>
  <div class="section-head"><div><h2>Closest matches</h2><p>Fewest missing ingredients first</p></div></div><div class="cards">${close.length?close.slice(0,80).map(x=>recipeCard(x.r,x.s)).join(''):'<div class="empty">Add another ingredient to find related recipes.</div>'}</div>`:''}`;
}

function shoppingSummary(){
  const recipes=[...state.plan].map(getRecipe).filter(Boolean);const needed=[];recipes.forEach(r=>needed.push(...r.ingredients));
  const inventory=[...state.pantry];const available=inventory.map(name=>({name,key:canon(name),used:false}));const missing=[];
  const needs=needed.map(name=>({name,key:canon(name),generic:GENERIC_INGREDIENTS.has(canon(name))})).sort((a,b)=>Number(a.generic)-Number(b.generic));
  for(const need of needs){let idx=available.findIndex(x=>!x.used&&x.key===need.key);if(idx<0)idx=available.findIndex(x=>!x.used&&fulfillsItem(x.name,need.name));if(idx>=0)available[idx].used=true;else missing.push(need.name);}
  return {recipes,missing:countIngredients(missing),needed:countIngredients(needed)};
}
function shopping(){
  const s=shoppingSummary();
  return `<div class="page-title"><h1>Shopping List</h1><p>Plan recipes and Aurai combines what you still need after checking My Items.</p></div>
  ${!s.recipes.length?'<div class="empty large-empty"><b>No recipes planned yet</b><span>Open any recipe and tap “Add to shopping list”.</span><button data-go="recipes" class="primary-btn">Browse recipes</button></div>':`<div class="shopping-summary"><div><strong>${s.recipes.length}</strong><span>planned recipes</span></div><div><strong>${s.missing.reduce((n,[,c])=>n+c,0)}</strong><span>ingredients missing</span></div></div>
  <div class="section-head"><div><h2>Still needed</h2><p>Combined across every planned recipe</p></div><button id="copyShopping">Copy list</button></div>
  <div class="shopping-list">${s.missing.length?s.missing.map(([name,count])=>`<button data-ingredient-open="${esc(name)}"><span>${esc(name)}</span><strong>×${count}</strong></button>`).join(''):'<div class="notice success-note"><strong>You already have everything in My Items.</strong></div>'}</div>
  <div class="section-head"><div><h2>Planned recipes</h2><p>Tap a recipe for details</p></div><button id="clearPlan">Clear all</button></div><div class="cards">${s.recipes.map(r=>recipeCard(r,pantryStatus(r))).join('')}</div>`}`;
}

function compareRecipePanel(r){
  if(!r)return '<div class="compare-empty">Choose a recipe above.</div>';
  const status=state.pantry.length?pantryStatus(r):null;
  return `<div class="compare-panel"><div class="recipe-icon">${iconFor(r.type)}</div><h3>${esc(r.name)}</h3><div class="meta"><span class="chip gold">${esc(r.type)}</span><span class="chip">${esc(r.station)}</span></div>
    <dl><dt>Makes</dt><dd>${esc(r.yield)}</dd><dt>Ingredients</dt><dd>${countIngredients(r.ingredients).map(([n,c])=>`${esc(n)}${c>1?` ×${c}`:''}`).join('<br>')}</dd><dt>Use / tags</dt><dd>${(r.tags||[]).length?(r.tags||[]).map(esc).join(' · '):esc(r.note||'No quick-use tags in the recipe index')}</dd>${status?`<dt>My Items</dt><dd>${status.craftable?'Ready to make':`Have ${status.haveUnits}/${status.totalUnits}`}</dd>`:''}</dl>
    <button data-recipe="${esc(r.id)}" class="secondary-btn compare-open">Open recipe</button></div>`;
}
function compare(){
  const options=catalogRecipes.map(r=>`<option value="${esc(r.id)}">${esc(r.name)} — ${esc(r.station)}</option>`).join('');
  const a=getRecipe(state.compareA),b=getRecipe(state.compareB);
  return `<div class="page-title"><h1>Compare Recipes</h1><p>Useful when two recipes make similar items or compete for the same ingredients.</p></div>
  <div class="compare-selects"><label>Recipe A<select id="compareA"><option value="">Choose recipe…</option>${options}</select></label><label>Recipe B<select id="compareB"><option value="">Choose recipe…</option>${options}</select></label></div>
  <div class="compare-grid">${compareRecipePanel(a)}${compareRecipePanel(b)}</div>`;
}

function guideCard(g){return `<article class="guide-card"><h3>${g.icon} ${esc(g.title)}</h3><p>${esc(g.text)}</p>${g.points?.length?`<ul>${g.points.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>`:''}</article>`;}
function guides(){return `<div class="page-title"><h1>Field Guides</h1><p>Short practical notes for decisions that come up often during a run.</p></div><div class="cards">${D.guides.map(guideCard).join('')}</div><div class="notice" style="margin-top:14px">For exact mechanics and unusual cases, use Wiki Explorer to open the current Outward Wiki article.</div>`;}
function saved(){const list=catalogRecipes.filter(r=>state.saved.has(r.id));return `<div class="page-title"><h1>Saved</h1><p>Favourite recipes are stored on this device.</p></div><div class="cards">${list.length?list.map(r=>recipeCard(r)).join(''):'<div class="empty">Tap ♡ on a recipe to keep it here.</div>'}</div>`;}

const wikiAreas=[['⚗️','Alchemy','Alchemy'],['🍲','Cooking','Cooking'],['⚔️','Weapons','Weapons'],['🛡️','Equipment','Equipment'],['👹','Enemies','Enemies'],['🗺️','Locations','Locations'],['📜','Quests','Quests'],['✨','Skills','Skills'],['🔮','Enchantments','Enchantments']];
function wiki(){
  return `<div class="page-title"><h1>Wiki Explorer</h1><p>The recipe index can be cached offline. Wiki Explorer is for detailed pages, enemies, quests, locations and everything else.</p></div>
  <div class="searchbox"><input id="wikiSearch" value="${esc(state.wikiQuery)}" placeholder="Potion, enemy, quest, item…"><button id="wikiGo">Search</button></div>
  <div class="wiki-categories">${wikiAreas.map(a=>`<button data-wiki-page="${esc(a[2])}"><b>${a[0]}</b><span>${esc(a[1])}</span></button>`).join('')}</div>
  <div class="notice"><strong>Online feature:</strong> detailed wiki search needs internet. Your synced recipe database and My Items continue to work offline.</div>
  <div id="wikiResults" class="cards">${recentWikiHTML()}</div>`;
}
function recentWikiHTML(){if(!state.recentWiki.length)return '<div class="empty">Search above, or choose a category to open the wiki.</div>';return `<div class="section-head" style="margin-top:2px"><div><h2>Recent lookups</h2><p>Stored only on this device</p></div></div>${state.recentWiki.map((q,i)=>`<article class="wiki-card" data-recent-wiki="${esc(q)}"><div class="wiki-index">${i+1}</div><a href="#"><h3>${esc(q)}</h3><p>Search the Outward Wiki again</p></a></article>`).join('')}`;}

function render(){
  const views={home,recipes,pantry,shopping,compare,wiki,guides,saved};
  app.innerHTML=(views[state.route]||home)();app.setAttribute('aria-label',routeTitle(state.route));
  $$('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.route===state.route));renderDrawer();bindView();
  if(state.route==='compare'){const a=$('#compareA'),b=$('#compareB');if(a)a.value=state.compareA||'';if(b)b.value=state.compareB||'';}
}
function renderDrawer(){
  const nav=$('#drawerNav');
  nav.innerHTML=[['home','⌂','Home'],['recipes','⚗','Recipes'],['pantry','🎒','My Items'],['shopping','🧾','Shopping List'],['compare','⚖','Compare'],['wiki','📖','Wiki Explorer'],['guides','✦','Field Guides'],['saved','♡','Saved']].map(([r,i,n])=>`<button data-drawer-route="${r}" class="${state.route===r?'active':''}">${i}&nbsp;&nbsp;${n}</button>`).join('');
  $$('[data-drawer-route]').forEach(b=>b.onclick=()=>setRoute(b.dataset.drawerRoute));
}
function setRoute(route,push=true){
  if(!allowedRoutes.has(route))route='home';state.route=route;closeDrawer();closeSheet();haptic();render();
  if(push&&location.protocol!=='file:'){const u=new URL(location.href);if(route==='home')u.searchParams.delete('route');else u.searchParams.set('route',route);history.pushState({route},'',u);}
  requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'smooth'}));
}
function bindRecipeCards(root=document){
  root.querySelectorAll('[data-recipe]').forEach(el=>el.onclick=e=>{if(e.target.closest('[data-save]'))return;openRecipe(el.dataset.recipe);});
  root.querySelectorAll('[data-save]').forEach(el=>el.onclick=e=>{e.stopPropagation();toggleSave(el.dataset.save);});
}
function bindView(){
  $$('[data-go]').forEach(el=>el.onclick=()=>{if(el.dataset.filter){state.filter=el.dataset.filter;state.query='';state.purpose='All';}setRoute(el.dataset.go);});
  $$('.filter-row [data-filter]').forEach(el=>el.onclick=()=>{state.filter=el.dataset.filter;render();});
  $$('[data-purpose]').forEach(el=>el.onclick=()=>{state.purpose=el.dataset.purpose;render();});
  bindRecipeCards();

  const rs=$('#recipeSearch');if(rs)rs.oninput=e=>{state.query=e.target.value;const list=$('#recipeList');list.innerHTML=recipeListHTML();bindRecipeCards(list);};
  const hs=$('#homeSearch'),hg=$('#homeGo');if(hg)hg.onclick=()=>{state.query=hs.value;state.filter='All';state.purpose='All';setRoute('recipes');};if(hs)hs.onkeydown=e=>{if(e.key==='Enter')hg.click();};
  const sync=$('#syncRecipes');if(sync)sync.onclick=()=>syncRecipeDatabase();

  const pa=$('#pantryAdd'),pi=$('#pantryInput');if(pa)pa.onclick=()=>addPantry(pi.value);if(pi){pi.onkeydown=e=>{if(e.key==='Enter')pa.click();};pi.oninput=e=>{state.ingredientQuery=e.target.value;const box=$('#ingredientSuggestions');if(box)box.innerHTML=ingredientSuggestionHTML(state.ingredientQuery);bindIngredientSuggestions();};}
  bindIngredientSuggestions();
  $$('[data-quick-ingredient]').forEach(b=>b.onclick=()=>addPantry(b.dataset.quickIngredient));
  $$('[data-pantry-inc]').forEach(b=>b.onclick=()=>changePantry(decodeURIComponent(b.dataset.pantryInc),1));
  $$('[data-pantry-dec]').forEach(b=>b.onclick=()=>changePantry(decodeURIComponent(b.dataset.pantryDec),-1));
  $$('[data-ingredient-open]').forEach(b=>b.onclick=()=>openIngredient(b.dataset.ingredientOpen));
  const cp=$('#clearPantry');if(cp)cp.onclick=()=>{state.pantry=[];state.pantryQuery='';saveState();render();toast('Items cleared');};
  const prs=$('#pantryRecipeSearch');if(prs)prs.oninput=e=>{state.pantryQuery=e.target.value;render();requestAnimationFrame(()=>{const input=$('#pantryRecipeSearch');if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);}});};
  const sl=$('#saveLoadout');if(sl)sl.onclick=saveLoadoutSheet;const ml=$('#manageLoadouts');if(ml)ml.onclick=openLoadoutsSheet;$$('[data-load-loadout]').forEach(b=>b.onclick=()=>loadLoadout(b.dataset.loadLoadout));

  const clearPlan=$('#clearPlan');if(clearPlan)clearPlan.onclick=()=>{state.plan.clear();saveState();render();toast('Shopping list cleared');};
  const copy=$('#copyShopping');if(copy)copy.onclick=copyShoppingList;

  const ca=$('#compareA'),cb=$('#compareB');if(ca)ca.onchange=e=>{state.compareA=e.target.value;saveState();render();};if(cb)cb.onchange=e=>{state.compareB=e.target.value;saveState();render();};

  const wg=$('#wikiGo'),ws=$('#wikiSearch');if(wg)wg.onclick=()=>searchWiki(ws.value);if(ws)ws.onkeydown=e=>{if(e.key==='Enter')wg.click();};
  $$('[data-wiki-page]').forEach(b=>b.onclick=()=>openExternal(wikiURL(b.dataset.wikiPage)));$$('[data-recent-wiki]').forEach(c=>c.onclick=e=>{e.preventDefault();searchWiki(c.dataset.recentWiki);});
}
function bindIngredientSuggestions(){
  $$('[data-ingredient-suggestion]').forEach(b=>b.onclick=()=>{const input=$('#pantryInput');if(input)input.value=b.dataset.ingredientSuggestion;addPantry(b.dataset.ingredientSuggestion);});
}
function addPantry(value){
  const raw=String(value||'').trim();if(!raw)return toast('Enter an ingredient');const v=normalizeIngredient(raw);state.pantry.push(v);saveState();haptic();render();
  if(canon(raw)!==canon(v))toast(`Added ${v}`);requestAnimationFrame(()=>$('#pantryInput')?.focus());
}
function changePantry(key,delta){
  if(delta>0)state.pantry.push(ingredientByKey.get(key)||key);else{const idx=state.pantry.map(canon).lastIndexOf(key);if(idx>=0)state.pantry.splice(idx,1);}saveState();haptic();render();
}
function toggleSave(id){if(state.saved.has(id)){state.saved.delete(id);toast('Removed from saved');}else{state.saved.add(id);toast('Saved recipe');}saveState();haptic();render();}
function togglePlan(id){if(state.plan.has(id)){state.plan.delete(id);toast('Removed from shopping list');}else{state.plan.add(id);toast('Added to shopping list');}saveState();haptic();}

function saveLoadoutSheet(){
  if(!state.pantry.length)return toast('Add some items first');
  showSheet(`<div class="detail-head"><div><div class="hero-kicker">My Items</div><h2>Save loadout</h2></div></div><p class="sheet-copy">Keep this ingredient setup so you can restore it later.</p><input class="sheet-input" id="loadoutName" placeholder="e.g. Cierzo supply run" maxlength="40"><button class="primary-btn full-btn" id="confirmLoadout">Save loadout</button>`);
  requestAnimationFrame(()=>$('#loadoutName')?.focus());$('#confirmLoadout').onclick=()=>{const name=$('#loadoutName').value.trim()||`Loadout ${state.loadouts.length+1}`;state.loadouts.unshift({id:`l-${Date.now().toString(36)}`,name,items:[...state.pantry],createdAt:Date.now()});state.loadouts=state.loadouts.slice(0,12);saveState();closeSheet();render();toast('Loadout saved');};
}
function openLoadoutsSheet(){
  const html=state.loadouts.length?state.loadouts.map(l=>`<div class="loadout-row"><button data-sheet-load="${esc(l.id)}"><strong>${esc(l.name)}</strong><small>${l.items.length} items</small></button><button class="delete-mini" data-delete-loadout="${esc(l.id)}" aria-label="Delete ${esc(l.name)}">×</button></div>`).join(''):'<div class="empty">No saved loadouts yet.</div>';
  showSheet(`<div class="detail-head"><div><div class="hero-kicker">My Items</div><h2>Saved loadouts</h2></div></div>${html}`);
  $$('[data-sheet-load]').forEach(b=>b.onclick=()=>{closeSheet();loadLoadout(b.dataset.sheetLoad);});$$('[data-delete-loadout]').forEach(b=>b.onclick=()=>{state.loadouts=state.loadouts.filter(l=>l.id!==b.dataset.deleteLoadout);saveState();closeSheet();openLoadoutsSheet();});
}
function loadLoadout(id){const l=state.loadouts.find(x=>x.id===id);if(!l)return;state.pantry=[...l.items];saveState();render();toast(`Loaded ${l.name}`);}
async function copyShoppingList(){
  const s=shoppingSummary();const text=s.missing.length?s.missing.map(([n,c])=>`${n} x${c}`).join('\n'):'Nothing missing — My Items covers every planned recipe.';
  try{await navigator.clipboard.writeText(text);toast('Shopping list copied');}catch{if(navigator.share){try{await navigator.share({title:'Aurai Companion shopping list',text});}catch{}}else toast('Could not copy list');}
}

function showSheet(html){$('#infoSheetContent').innerHTML=html;$('#infoSheet').classList.add('open');$('#infoSheet').setAttribute('aria-hidden','false');$('#sheetBackdrop').classList.add('show');document.body.style.overflow='hidden';}
function closeSheet(){$('#infoSheet').classList.remove('open');$('#infoSheet').setAttribute('aria-hidden','true');$('#sheetBackdrop').classList.remove('show');document.body.style.overflow='';}
function openIngredient(name){
  const matches=catalogRecipes.filter(r=>(r.ingredients||[]).some(i=>canon(i)===canon(name))).slice(0,30);
  const current=state.pantry.filter(i=>canon(i)===canon(name)).length;
  showSheet(`<div class="detail-head"><div><div class="hero-kicker">Ingredient</div><h2>${esc(name)}</h2><div class="meta"><span class="chip">${matches.length} recipe${matches.length===1?'':'s'}</span>${current?`<span class="chip green">In My Items ×${current}</span>`:''}</div></div></div>
    <div class="actions"><button class="primary-btn" id="ingredientAdd">+ Add to My Items</button><button class="secondary-btn" id="ingredientWiki">Open Wiki</button></div>
    <div class="detail-block"><h3>Recipes using it</h3><div class="ingredient-uses">${matches.length?matches.map(r=>`<button data-sheet-recipe="${esc(r.id)}"><span>${iconFor(r.type)} ${esc(r.name)}</span><small>${esc(r.station)}</small></button>`).join(''):'<div class="empty">No recipe in the current index uses this exact ingredient name.</div>'}</div></div>`);
  $('#ingredientAdd').onclick=()=>{state.pantry.push(normalizeIngredient(name));saveState();toast(`Added ${name}`);closeSheet();if(state.route==='pantry')render();};$('#ingredientWiki').onclick=()=>openExternal(wikiURL(name));
  $$('[data-sheet-recipe]').forEach(b=>b.onclick=()=>openRecipe(b.dataset.sheetRecipe));
}
function openRecipe(id){
  const r=getRecipe(id);if(!r)return;const status=state.pantry.length?pantryStatus(r):null;
  const pantryNote=status?status.craftable?'<div class="notice success-note"><strong>Ready to make:</strong> you have all required ingredients in My Items.</div>':status.haveUnits?`<div class="notice"><strong>From My Items:</strong> you have ${status.haveUnits}/${status.totalUnits}. Missing ${status.missing.map(([n,c])=>`${esc(n)}${c>1?` ×${c}`:''}`).join(', ')}.</div>`:'' :'';
  showSheet(`<div class="detail-head"><div><div class="hero-kicker">${esc(r.type)} · ${esc(r.station)}</div><h2>${esc(r.name)}</h2><div class="meta"><span class="chip gold">Makes ${esc(r.yield)}</span>${(r.tags||[]).slice(0,4).map(t=>`<span class="chip">${esc(t)}</span>`).join('')}${r.source==='wiki-index'?'<span class="chip blue">Offline index</span>':''}</div></div></div>
    <div class="detail-block"><h3>Ingredients</h3><div class="ingredient-list">${countIngredients(r.ingredients).map(([name,count])=>`<button class="ingredient-row ingredient-link" data-ingredient-open="${esc(name)}"><span>${esc(name)}</span><strong>×${count} ›</strong></button>`).join('')}</div></div>${pantryNote}
    ${r.note?`<div class="detail-block"><h3>Quick note</h3><div class="notice">${esc(r.note)}</div></div>`:''}
    <div class="actions"><button class="secondary-btn" id="sheetSave">${state.saved.has(r.id)?'♥ Saved':'♡ Save'}</button><button class="primary-btn" id="sheetWiki">Open Wiki</button></div>
    <div class="actions"><button class="secondary-btn" id="sheetPlan">${state.plan.has(r.id)?'✓ In shopping list':'＋ Shopping list'}</button><button class="secondary-btn" id="sheetCompare">⚖ Compare</button></div>
    ${navigator.share?'<div class="actions"><button class="secondary-btn" id="sheetShare">Share recipe</button></div>':''}`);
  $('#sheetSave').onclick=()=>{toggleSave(r.id);closeSheet();};$('#sheetWiki').onclick=()=>openExternal(wikiURL(r.wiki||r.name));$('#sheetPlan').onclick=()=>{togglePlan(r.id);closeSheet();render();};
  $('#sheetCompare').onclick=()=>{if(!state.compareA||state.compareA===r.id)state.compareA=r.id;else state.compareB=r.id;saveState();closeSheet();setRoute('compare');};
  $$('[data-ingredient-open]').forEach(b=>b.onclick=()=>openIngredient(b.dataset.ingredientOpen));
  const share=$('#sheetShare');if(share)share.onclick=async()=>{try{await navigator.share({title:`${r.name} — Aurai Companion`,text:`${r.name}: ${r.ingredients.join(', ')}`,url:wikiURL(r.wiki||r.name)});}catch{}};
}

async function searchWiki(raw){
  const q=String(raw||'').trim();if(!q)return toast('Enter something to search');state.wikiQuery=q;state.recentWiki=[q,...state.recentWiki.filter(x=>x.toLowerCase()!==q.toLowerCase())].slice(0,6);saveState();
  const target=$('#wikiResults');if(!target)return;target.innerHTML='<div class="wiki-status"><div class="spinner"></div>Searching Outward Wiki…</div>';wikiAbort?.abort();wikiAbort=new AbortController();
  try{const url=`${WIKI_API}?action=query&format=json&origin=*&list=search&srlimit=12&srnamespace=0&srsearch=${encodeURIComponent(q)}`;const res=await fetch(url,{signal:wikiAbort.signal,headers:{Accept:'application/json'}});if(!res.ok)throw new Error(`HTTP ${res.status}`);const data=await res.json();const results=data?.query?.search||[];
    if(!results.length){target.innerHTML=`<div class="empty">No live results for “${esc(q)}”. <button class="link-btn" id="wikiFallback">Open wiki search</button></div>`;$('#wikiFallback').onclick=()=>openExternal(`${WIKI}/index.php?search=${encodeURIComponent(q)}`);return;}
    target.innerHTML=results.map((r,i)=>`<article class="wiki-card" data-wiki-url="${esc(wikiURL(r.title))}"><div class="wiki-index">${i+1}</div><a href="#"><h3>${esc(r.title)}</h3><p>${esc(stripHTML(r.snippet)||'Open this article on the Outward Wiki.')}</p></a></article>`).join('');$$('[data-wiki-url]').forEach(c=>c.onclick=e=>{e.preventDefault();openExternal(c.dataset.wikiUrl);});
  }catch(err){if(err.name==='AbortError')return;target.innerHTML=`<div class="empty">Live lookup could not connect. <button class="link-btn" id="wikiFallback">Search outward.wiki.gg directly</button></div>`;$('#wikiFallback').onclick=()=>openExternal(`${WIKI}/index.php?search=${encodeURIComponent(q)}`);}
}

function openDrawer(){$('#drawer').classList.add('open');$('#drawer').setAttribute('aria-hidden','false');$('#backdrop').classList.add('show');}
function closeDrawer(){$('#drawer').classList.remove('open');$('#drawer').setAttribute('aria-hidden','true');$('#backdrop').classList.remove('show');}
function installSheetHTML(){
  if(IS_NATIVE)return `<div class="install-card"><img src="icon.svg" alt=""><h2>Aurai Companion</h2><p>The Android app is installed and ready to use.</p><div class="install-steps"><div><span class="step-num">✓</span><span>Recipes, My Items, saved recipes, loadouts and shopping lists stay on this phone.</span></div><div><span class="step-num">✓</span><span>Sync the recipe database while online, then use it offline.</span></div></div><small>Version ${APP_VERSION}</small></div>`;
  if(IS_STANDALONE)return `<div class="install-card"><img src="icon.svg" alt=""><h2>Already installed</h2><p>Aurai Companion is running in standalone app mode.</p><div class="install-steps"><div><span class="step-num">✓</span><span>Launch it from your home screen or app drawer.</span></div><div><span class="step-num">✓</span><span>Hosted web updates are checked automatically.</span></div></div><small>Version ${APP_VERSION}</small></div>`;
  if(deferredInstallPrompt)return `<div class="install-card"><img src="icon.svg" alt=""><h2>Install Aurai Companion</h2><p>Add it to this phone so it opens like a normal app.</p><div class="install-steps"><div><span class="step-num">1</span><span>Tap <strong>Install now</strong>.</span></div><div><span class="step-num">2</span><span>Confirm the browser install prompt.</span></div></div><button class="primary-btn" id="installNow" style="width:100%">Install now</button></div>`;
  const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);return `<div class="install-card"><img src="icon.svg" alt=""><h2>Install on this phone</h2><p>${isiOS?'Safari installs web apps from the Share menu.':'Open the browser menu and choose Install app or Add to Home screen.'}</p><small>Version ${APP_VERSION}</small></div>`;
}
function showInstallSheet(){showSheet(installSheetHTML());const btn=$('#installNow');if(btn)btn.onclick=async()=>{try{await deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;closeSheet();}catch{toast('Install prompt unavailable');}};}
function updateNetworkLabel(){const l=$('#networkLabel');if(!l)return;if(navigator.onLine){l.textContent=state.dbSource==='wiki-cache'?`Online · ${catalogRecipes.length} recipes cached`:'Online · recipe sync available';l.className='online';}else{l.textContent=state.dbSource==='wiki-cache'?`Offline · ${catalogRecipes.length} recipes cached`:'Offline · starter recipes';l.className='offline';}}
function showUpdate(){if(IS_NATIVE)return;const bar=$('#updateBar');if(bar)bar.hidden=false;}
function hideUpdate(){const bar=$('#updateBar');if(bar)bar.hidden=true;}
async function checkForUpdate(){if(IS_NATIVE)return toast('APK updates come from your GitHub build');if(!swRegistration)return toast('Update checks need the hosted web version');try{await swRegistration.update();toast(swRegistration.waiting?'Update ready':'You’re up to date');if(swRegistration.waiting)showUpdate();}catch{toast('Could not check for updates');}}
function registerServiceWorker(){if(IS_NATIVE||!('serviceWorker' in navigator)||!/^https?:$/.test(location.protocol))return;navigator.serviceWorker.register('./sw.js').then(reg=>{swRegistration=reg;if(reg.waiting)showUpdate();reg.addEventListener('updatefound',()=>{const worker=reg.installing;if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)showUpdate();});});}).catch(()=>{});navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloadingForUpdate)return;reloadingForUpdate=true;location.reload();});}

$('#menuBtn').onclick=openDrawer;$('#backdrop').onclick=closeDrawer;$('#brandHome').onclick=()=>setRoute('home');$('#installBtn').onclick=showInstallSheet;$('#drawerInstall').onclick=()=>{closeDrawer();showInstallSheet();};$('#drawerUpdate').onclick=()=>{closeDrawer();checkForUpdate();};$('#sheetBackdrop').onclick=closeSheet;$$('[data-close-sheet]').forEach(b=>b.onclick=closeSheet);$('#dismissUpdate').onclick=hideUpdate;$('#applyUpdate').onclick=()=>{if(swRegistration?.waiting){hideUpdate();swRegistration.waiting.postMessage({type:'SKIP_WAITING'});toast('Updating…');}else{hideUpdate();toast('No web update is waiting');}};
$$('.bottom-nav button').forEach(b=>b.onclick=()=>setRoute(b.dataset.route));window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('#installBtn').hidden=false;});window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;toast('Aurai Companion installed');});window.addEventListener('online',()=>{updateNetworkLabel();if(state.dbSource!=='wiki-cache')syncRecipeDatabase({silent:true});});window.addEventListener('offline',updateNetworkLabel);window.addEventListener('popstate',e=>{const u=new URL(location.href);const r=e.state?.route||u.searchParams.get('route')||'home';state.route=allowedRoutes.has(r)?r:'home';render();});window.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDrawer();closeSheet();}});

if(IS_NATIVE){hideUpdate();const updateButton=$('#drawerUpdate');if(updateButton)updateButton.hidden=true;const installButton=$('#installBtn');if(installButton)installButton.setAttribute('aria-label','App info');const drawerInstall=$('#drawerInstall');if(drawerInstall)drawerInstall.textContent='App info';}
updateNetworkLabel();render();registerServiceWorker();initRecipeDatabase().finally(updateNetworkLabel);setTimeout(()=>$('#splash')?.classList.add('hide'),520);
