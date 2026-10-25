import { createMap, escapeHtml as e, parseSharedView } from './map.js';
import { setupMobileMapFocus } from './mobile-map-focus.js';
import { loadDataset } from './data.js';
import { REGION_ORDER,statusOf,queryStations,priceText,hasPrice,distanceKm,formatTime,todayHours,fittedView,ageSeconds } from './domain.js';
import { mountAdBanner } from './ads.js';
import { mountBottomAd } from './ad-bottom.js';

const $=id=>document.getElementById(id);
const config=window.H2_CONFIG||{};
const params=new URLSearchParams(location.search);
const sharedView=parseSharedView(params);
const state={stations:[],manifest:null,collection:null,rows:[],selected:null,map:null,bounds:null,origin:null,busy:false,priceRanks:new Map()};
const filters={keyword:params.get('q')||'',region:params.get('region')||'',vehicle:'car',pressure:'',maxPrice:'',open:false,favorite:false,viewport:false,sort:'name'};
let favorites=new Set();
try { const saved=JSON.parse(localStorage.getItem('h2-favorites-v1')||'[]');if(Array.isArray(saved)) favorites=new Set(saved.filter(x=>typeof x==='string')); } catch {}
let toastTimer,searchTimer,refreshTask,focusBeforeDetail,mobileMapFocus;
function toast(message) {$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function saveFavorites(){try{localStorage.setItem('h2-favorites-v1',JSON.stringify([...favorites]));}catch{toast('이 브라우저에서는 관심 충전소를 저장할 수 없습니다.');}}
const adConfig=window.H2_AD_CONFIG||{};
const placement=name=>({enabled:adConfig.enabled,script:adConfig.script,...(adConfig.placements?.[name]||{})});
function createAdHost(modifier){const host=document.createElement('section');host.className=`adfit-banner ${modifier}`;host.hidden=true;host.setAttribute('aria-label','광고');host.innerHTML='<span class="adfit-label">광고</span><div class="adfit-creative"></div>';return host;}
const listAdHost=createAdHost('adfit-banner--list');
const listAd=mountAdBanner({host:listAdHost,root:$('list'),config:placement('list'),preview:false});
const detailAdHost=createAdHost('adfit-banner--detail');
const detailAd=mountAdBanner({host:detailAdHost,root:$('detail-content'),config:placement('detail'),preview:false});
const bottomAdShell=document.createElement('aside');
bottomAdShell.className='ad-bottom';bottomAdShell.hidden=true;bottomAdShell.setAttribute('aria-label','하단 광고');
bottomAdShell.innerHTML='<button type="button" class="ad-bottom-toggle" aria-controls="bottomAdPanel" aria-expanded="true">광고 접기</button><section id="bottomAdPanel" class="adfit-banner ad-bottom-panel" aria-label="광고"><span class="adfit-label">광고</span><div class="adfit-creative"></div></section>';
document.body.append(bottomAdShell);
mountBottomAd({shell:bottomAdShell,config:placement('bottom'),preview:false});

for (const region of REGION_ORDER) {const option=document.createElement('option');option.value=region;option.textContent=region;$('region').append(option);}
$('keyword').value=filters.keyword;
if (REGION_ORDER.includes(filters.region)) $('region').value=filters.region;else filters.region='';

function topPriceRanks(rows){
  const ranked=(Array.isArray(rows)?rows:[]).filter(hasPrice).slice().sort((a,b)=>a.pricePerKg-b.pricePerKg||a.name.localeCompare(b.name,'ko-KR')).slice(0,5);
  return new Map(ranked.map((station,index)=>[String(station.id),index+1]));
}
function card(s){
  const status=statusOf(s), km=state.origin?distanceKm(state.origin,s):null, rank=state.priceRanks.get(String(s.id))||null;
  const queue=status.queue!==null?`대기 ${status.queue}대`:'대기 미확인';
  return `<article class="station-card${state.selected===s.id?' selected':''}${rank?' top-price-card':''}" data-id="${e(s.id)}"><button class="select-station" type="button" data-select="${e(s.id)}" aria-label="${e(s.name)} 상세정보" aria-pressed="${state.selected===s.id}"><div class="card-status">${rank?`<span class="top-price-rank">최저가 ${rank}위</span>`:''}<span class="status-tag ${status.tone}"><i class="dot ${status.tone}"></i>${e(status.label)}</span><span>${e(s.vehicleLabel)}</span><span class="distance">${km!==null?`${km.toFixed(1)} km`:e(s.region)}</span></div><h2>${e(s.name)}</h2><p class="address">${e(s.address||'주소 미제공')}</p><div class="card-bottom"><div class="price${hasPrice(s)?'':' missing'}">${e(priceText(s))}${hasPrice(s)?'<small>원/kg</small>':''}</div><div class="card-facts">${e(queue)} · ${e(s.pressureLabel)}<br>${e(todayHours(s))}</div></div></button><button class="favorite-btn" type="button" data-favorite="${e(s.id)}" aria-label="${e(s.name)} 관심 충전소" aria-pressed="${favorites.has(s.id)}">${favorites.has(s.id)?'★':'☆'}</button></article>`;
}
function summaries(){return new Map(state.stations.map(s=>{const summary=statusOf(s);return [s.id,{tone:summary.tone,label:summary.label,price:s.pricePerKg,topRank:state.priceRanks.get(String(s.id))||null}];}));}
function render({preserveScroll=true}={}){
  const top=$('list').scrollTop;
  state.rows=queryStations(state.stations,filters,{bounds:state.bounds,origin:state.origin||state.map?.getCenter(),favorites});
  state.priceRanks=topPriceRanks(state.rows);
  $('result-count').textContent=state.rows.length.toLocaleString('ko-KR');
  if($('focus-list-count'))$('focus-list-count').textContent=state.rows.length.toLocaleString('ko-KR');
  if($('focus-favorite-count'))$('focus-favorite-count').textContent=favorites.size.toLocaleString('ko-KR');
  $('scope-label').textContent=filters.viewport?'현재 지도 안':filters.region||'전국 조회';
  $('list').setAttribute('aria-busy','false');
  if (state.rows.length) {
    const fragment=document.createDocumentFragment();
    state.rows.forEach((s,index)=>{const template=document.createElement('template');template.innerHTML=card(s);fragment.append(template.content);if(index===5) fragment.append(listAdHost);});
    $('list').replaceChildren(fragment);listAd.update(state.rows.length);
  } else {
    $('list').innerHTML='<div class="empty"><div class="empty-symbol">H₂</div><h2>조건에 맞는 충전소가 없어요</h2><p>지도를 넓히거나 검색 조건을 바꿔 보세요.\n상태가 오래된 곳은 ‘영업 확인’에서 제외됩니다.</p><button data-action="nation">전국 충전소 보기</button></div>';
  }
  if(preserveScroll)$('list').scrollTop=top;
  state.map?.setStations(state.rows,{selectedId:state.selected,summaries:summaries()});
  const delayed=state.manifest&&ageSeconds(state.manifest.generatedAt)>1800;
  $('collected-at').textContent=state.manifest?`${delayed?'갱신 지연 · ':''}수집 ${formatTime(state.manifest.generatedAt)} KST`:'수집 정보 없음';
}
function viewUrl(station){
  const u=new URL(location.href);u.search='';
  if(station)u.searchParams.set('station',station.id);
  const center=state.map?.getCenter();
  if(center){u.searchParams.set('lat',center.lat.toFixed(6));u.searchParams.set('lng',center.lng.toFixed(6));u.searchParams.set('z',state.map.getZoom());}
  return u.href;
}
function detail(s){
  const status=statusOf(s);
  const days=['월','화','수','목','금','토','일','공휴일'];
  const hours=Object.entries(s.hours||{}).map(([,h],i)=>`<tr><th>${days[i]}</th><td>${h.enabled===false?'정기 휴무':h.start&&h.end?`${e(h.start)}–${e(h.end)}`:'미제공'}</td></tr>`).join('');
  const phone=(s.phone||'').replace(/[^+\d]/g,'');
  const naverSearch=`https://map.naver.com/p/search/${encodeURIComponent(s.name+' '+s.address)}`;
  const kakaoSearch=`https://map.kakao.com/link/search/${encodeURIComponent(s.name)}`;
  const mapPoint=Number.isFinite(s.lat)&&Number.isFinite(s.lng);
  const naverNav=mapPoint?`https://map.naver.com/p/directions/-/${s.lng},${s.lat},${encodeURIComponent(s.name)},0,PLACE_POI/-/car?c=15.00,0,0,0,dh`:naverSearch;
  const queue=status.queue!==null?`${status.queue}대 (조회 ${formatTime(s.observedAt)} KST)`:'현재 대기차량 수 미확인';
  const waitingBreakdown=status.open&&(Number.isInteger(s.waitingCars)||Number.isInteger(s.waitingBuses))?`<br><small>승용 ${s.waitingCars??'미제공'} · 승용 외 ${s.waitingBuses??'미제공'}대</small>`:'';
  $('detail-content').innerHTML=`<div class="detail-head"><button class="detail-close" data-action="close" aria-label="상세정보 닫기">×</button><span class="status-tag ${status.tone}"><i class="dot ${status.tone}"></i>${e(status.label)}</span><h2>${e(s.name)}</h2><p class="address">${e(s.address||'주소 미제공')}</p><div class="detail-price"><span class="price${hasPrice(s)?'':' missing'}">${e(priceText(s))}${hasPrice(s)?'<small>원 / kg</small>':''}</span></div><p class="micro">가격 조회 ${formatTime(s.priceObservedAt)} KST · 현장 판매가격과 다를 수 있습니다.</p></div><div class="detail-content">${!status.fresh?`<div class="notice">수집이 지연되어 현재 상태는 확인이 필요합니다. 마지막 수집 상태: ${e(status.previousLabel)}. 방문 전 공식 정보나 전화로 확인해 주세요.</div>`:''}<dl><dt>이용 차종</dt><dd>${e(s.vehicleLabel)}${s.vehicles.length===1&&s.vehicles[0]==='bus'?'<br><strong>승용차 충전 불가 · 버스 전용</strong>':''}</dd><dt>대기 현황</dt><dd>${e(queue)}${waitingBreakdown}</dd><dt>오늘 운영</dt><dd>${e(todayHours(s))}<br><small>정기시간표 기준 · 공휴일·임시 변경은 공식 정보 확인</small></dd><dt>휴게 시간</dt><dd>${s.breakTime?.start&&s.breakTime?.end?`${e(s.breakTime.start)}–${e(s.breakTime.end)}`:'미제공'}</dd><dt>설비 표기</dt><dd>${e(s.pressureLabel)}<br><small>차량 충전압력과 동일하다고 단정할 수 없습니다.</small></dd><dt>시설 유형</dt><dd>${e([s.stationType,s.equipmentType].filter(Boolean).join(' · ')||'미제공')}</dd><dt>결제 방법</dt><dd>${e(s.payment||'미제공')}</dd><dt>충전소 전화</dt><dd>${phone?`<a href="tel:${e(phone)}">${e(s.phone)}</a>`:'미제공'}</dd><dt>설비 원천 갱신</dt><dd>${formatTime(s.upstreamCheckedAt)}${s.upstreamCheckedAt?' KST':''}</dd><dt>운영상태 변경</dt><dd>${formatTime(s.operationChangedAt)}${s.operationChangedAt?' KST':''}</dd><dt>수집 확인</dt><dd>${formatTime(s.observedAt)} KST</dd></dl>${s.notice?`<p class="notice">${e(s.notice)}</p>`:''}<details class="hours"><summary>요일별 운영시간</summary><table><tbody>${hours}</tbody></table></details><div class="detail-actions"><a class="primary" href="${e(naverNav)}" target="_blank" rel="noopener noreferrer">네이버 길찾기 ↗</a><a href="${e(kakaoSearch)}" target="_blank" rel="noopener noreferrer">카카오맵 ↗</a><button data-action="share">공유</button></div><p class="micro">출처: <a href="https://www.h2nbiz.or.kr/rt/sch/rtSearch.do?tabNo=1" target="_blank" rel="noopener noreferrer">한국석유관리원 하잉 ↗</a><br>상태·대기대수는 수집 시점의 원천 표기이며 현장 상황과 다를 수 있습니다. 대기시간·완충 가능 대수는 추정하지 않습니다.</p></div>`;
  $('detail-content').append(detailAdHost);detailAd.update(true);
}
function selectStation(id,{focus=true,scroll=true}={}){
  const s=state.stations.find(row=>row.id===id);if(!s)return;
  focusBeforeDetail=document.activeElement;
  state.selected=id;$('detail').hidden=false;detail(s);render();
  const focusMap=()=>{if(focus)state.map?.focus(s,{zoom:Math.max(12,state.map.getZoom())});};
  if(mobileMapFocus?.isMobile()){mobileMapFocus.enterDetail();mobileMapFocus.afterLayout(focusMap);}else focusMap();
  if(scroll&&!mobileMapFocus?.isActive())$('list').querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({block:'nearest'});
  history.replaceState(null,'',viewUrl(s));
}
function closeDetail({restoreFocus=false,leaveMap=false}={}){
  state.selected=null;$('detail').hidden=true;detailAd.update(false);
  if(mobileMapFocus?.isActive()){
    if(leaveMap)mobileMapFocus.exit({restoreFocus});
    else mobileMapFocus.enterFullMap();
  }
  render();
  const u=new URL(location.href);u.searchParams.delete('station');history.replaceState(null,'',u);
  if(restoreFocus&&!mobileMapFocus?.isActive()&&focusBeforeDetail?.isConnected)focusBeforeDetail.focus({preventScroll:true});
}
function nation({reset=false}={}){
  if(reset){filters.keyword='';filters.region='';filters.pressure='';filters.maxPrice='';filters.open=false;filters.favorite=false;filters.vehicle='car';$('keyword').value='';$('region').value='';$('vehicle').value='car';$('pressure').value='';$('max-price').value='';$('open-only').checked=false;$('favorites-only').checked=false;}
  filters.viewport=false;state.bounds=null;
  state.selected=null;$('detail').hidden=true;
  const view=fittedView(state.stations,$('map').clientWidth,$('map').clientHeight);
  const baseZoom=view?.zoom||6;
  const initialZoom=mobileMapFocus?.isMobile()?Math.min(19,baseZoom+2):baseZoom;
  state.map?.setCenter(view?.center||{lat:36.1,lng:127.75},initialZoom);render({preserveScroll:false});
}
function search({move=false}={}){
  filters.keyword=$('keyword').value;filters.region=$('region').value;filters.vehicle=$('vehicle').value;
  filters.pressure=$('pressure').value;filters.maxPrice=$('max-price').value;filters.open=$('open-only').checked;filters.favorite=$('favorites-only').checked;filters.sort=$('sort').value;
  if(move){filters.viewport=false;state.bounds=null;}
  render({preserveScroll:false});
  if(move){const view=fittedView(state.rows,$('map').clientWidth,$('map').clientHeight);if(view)state.map?.setCenter(view.center,view.zoom);}
}
async function locate({quiet=false}={}){
  if(!navigator.geolocation){if(!quiet)toast('이 브라우저에서 위치 기능을 사용할 수 없습니다. 지역을 선택해 주세요.');return;}
  $('locate').disabled=true;$('locate').textContent='위치 확인 중…';
  navigator.geolocation.getCurrentPosition(position=>{
    state.origin={lat:position.coords.latitude,lng:position.coords.longitude};
    filters.viewport=true;filters.region='';$('region').value='';filters.sort='distance';$('sort').value='distance';
    state.map?.locate(state.origin);state.map?.setCenter(state.origin,mobileMapFocus?.isMobile()?11:10);render();
    $('locate').disabled=false;$('locate').textContent='◎ 내 위치';
  },()=>{$('locate').disabled=false;$('locate').textContent='◎ 내 위치';if(!quiet)toast('위치를 확인하지 못했습니다. 브라우저 위치 권한을 허용하거나 지역을 선택해 주세요.');},{enableHighAccuracy:false,timeout:8000,maximumAge:60000});
}
async function refresh({initial=false}={}){
  if(refreshTask)return refreshTask;
  $('refresh').disabled=true;$('refresh').textContent='확인 중…';
  refreshTask=(async()=>{
    try{
      const data=await loadDataset(config.dataBaseUrl||'./data');
      Object.assign(state,{stations:data.stations,manifest:data.manifest,collection:data.collection});
      render();
      if(state.selected){const selected=state.stations.find(s=>s.id===state.selected);if(selected)detail(selected);else closeDetail();}
      if(initial&&data.collection?.outcome==='failure')toast('최근 수집이 실패해 마지막 정상 데이터를 표시합니다. 수집현황을 확인해 주세요.');
    }catch(error){
      if(!state.stations.length){$('list').innerHTML=`<div class="empty"><h2>데이터를 불러오지 못했어요</h2><p>${e(error.message)}</p><button data-action="retry">다시 시도</button><p><a href="./data-status.html">수집현황 확인 ↗</a></p></div>`;$('list').setAttribute('aria-busy','false');}
      else toast('최신 파일을 확인하지 못해 이전 데이터를 유지합니다.');
    }finally{$('refresh').disabled=false;$('refresh').textContent='새로고침';refreshTask=null;}
  })();
  return refreshTask;
}

$('search-form').addEventListener('submit',event=>{event.preventDefault();clearTimeout(searchTimer);search({move:true});});
$('keyword').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>search({move:true}),350);});
for(const id of ['region','vehicle','pressure','max-price','open-only','favorites-only','sort'])$(id).addEventListener('change',()=>{if(id==='sort'&&$('sort').value==='distance'&&!state.origin)toast('현재 위치가 없어서 지도 중심 기준 직선거리로 정렬합니다.');search({move:['region','vehicle'].includes(id)});});
$('more-filters').addEventListener('click',()=>{const expanded=$('more-filters').getAttribute('aria-expanded')==='true';$('more-filters').setAttribute('aria-expanded',String(!expanded));$('extra-filters').hidden=expanded;state.map?.resize();});
$('reset').addEventListener('click',()=>nation({reset:true}));$('nation').addEventListener('click',()=>{filters.region='';$('region').value='';nation();});
$('locate').addEventListener('click',()=>locate());$('refresh').addEventListener('click',()=>refresh());
$('map-type-toggle').addEventListener('click',()=>{if(!state.map?.supportsMapType?.())return;const next=state.map.getMapType?.()==='satellite'?'normal':'satellite';if(state.map.setMapType?.(next)){const satellite=next==='satellite';$('map-type-toggle').setAttribute('aria-pressed',String(satellite));$('map-type-toggle').textContent=satellite?'일반 지도':'위성 지도';}});
$('mobile-map-layer').addEventListener('click',()=>$('map-type-toggle').click());
$('mobile-map-restore').addEventListener('click',()=>mobileMapFocus?.exit({restoreFocus:false}));
$('mobile-map-share').addEventListener('click',async()=>{
  const station=state.stations.find(s=>s.id===state.selected);
  const url=viewUrl(station);
  try{if(navigator.share)await navigator.share({title:station?station.name+' · 수소한눈':'수소한눈 지도',url});else{await navigator.clipboard.writeText(url);toast('현재 지도 링크를 복사했습니다.');}}catch(error){if(error.name!=='AbortError')toast('주소창의 링크를 복사해 공유해 주세요.');}
});
$('search-area').addEventListener('click',()=>{state.bounds=state.map?.getBounds();filters.viewport=true;render({preserveScroll:false});if(!state.rows.length)toast('현재 지도 안에 표시할 충전소가 없습니다.');});
$('auto-search').addEventListener('change',()=>{if($('auto-search').checked){state.bounds=state.map?.getBounds();filters.viewport=true;render({preserveScroll:false});}});
$('view-toggle').addEventListener('click',()=>{
  if(mobileMapFocus?.isMobile()){mobileMapFocus.enterFullMap();return;}
  const expanded=document.body.classList.toggle('list-expanded');$('view-toggle').setAttribute('aria-pressed',String(expanded));$('view-toggle').textContent=expanded?'지도 크게':'목록 크게';setTimeout(()=>state.map?.resize(),50);
});
$('list').addEventListener('click',event=>{
  const favorite=event.target.closest('[data-favorite]');if(favorite){const id=favorite.dataset.favorite;favorites.has(id)?favorites.delete(id):favorites.add(id);saveFavorites();render();return;}
  const selected=event.target.closest('[data-select]');if(selected){selectStation(selected.dataset.select);return;}
  const action=event.target.closest('[data-action]')?.dataset.action;if(action==='nation')nation({reset:true});if(action==='retry')refresh();
});
$('detail').addEventListener('click',async event=>{
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='close')closeDetail({restoreFocus:true});
  if(action==='share'){
    const station=state.stations.find(s=>s.id===state.selected);if(!station)return;
    try{if(navigator.share)await navigator.share({title:station.name+' · 수소한눈',url:viewUrl(station)});else{await navigator.clipboard.writeText(viewUrl(station));toast('충전소 링크를 복사했습니다.');}}catch(error){if(error.name!=='AbortError')toast('주소창의 링크를 복사해 공유해 주세요.');}
  }
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('detail').hidden)closeDetail({restoreFocus:true});});

await refresh({initial:true});
try{
  state.map=await createMap({container:$('map'),config,onSelect:id=>selectStation(id),onBackgroundClick:()=>{if(state.selected)closeDetail();},onBoundsChange:(bounds,context)=>{
    state.bounds=bounds;
    if($('auto-search').checked){filters.viewport=true;if(context?.source==='user'&&!mobileMapFocus?.isActive()){state.selected=null;$('detail').hidden=true;}render({preserveScroll:false});}
    if(!state.origin&&filters.sort==='distance')render();
  },onError:error=>toast(error.message)});
  mobileMapFocus=setupMobileMapFocus({
    workspace:document.querySelector('.workspace'),
    sidebar:document.querySelector('.sidebar'),
    mapSection:$('map-section'),
    results:$('list'),
    detail:$('detail'),
    detailHandle:$('detail-sheet-handle'),
    expandButton:$('detail-expand-toggle'),
    fullMapButton:$('detail-full-map'),
    dock:$('mobile-focus-dock'),
    dockList:$('focus-dock-list'),
    dockFavorites:$('focus-dock-favorites'),
    dockMore:$('focus-dock-more'),
    onResize:()=>state.map?.resize(),
    onModeChange:(mode)=>{
      if(mode==='open-list'){mobileMapFocus.exit({restoreFocus:false});requestAnimationFrame(()=>$('list').focus({preventScroll:true}));return;}
      if(mode==='open-favorites'){filters.favorite=true;$('favorites-only').checked=true;render({preserveScroll:false});mobileMapFocus.exit({restoreFocus:false});requestAnimationFrame(()=>$('list').focus({preventScroll:true}));return;}
      const selected=state.stations.find(row=>row.id===state.selected);if(selected)state.map?.focus(selected,{zoom:Math.max(12,state.map.getZoom())});
    },
    onRequestClose:()=>closeDetail({restoreFocus:true})
  });
  $('map-type-toggle').hidden=!state.map?.supportsMapType?.();
  $('mobile-map-layer').hidden=!state.map?.supportsMapType?.();
  if(mobileMapFocus?.isMobile())mobileMapFocus.enterFullMap();
  const shared=params.get('station');
  if(shared){const s=state.stations.find(row=>row.id===shared);if(s){filters.vehicle='';$('vehicle').value='';selectStation(shared,{scroll:false,focus:!sharedView});}else toast('공유된 충전소를 현재 수집 목록에서 찾지 못했습니다.');}
  if(sharedView)state.map.setCenter(sharedView.center,sharedView.zoom);
  else if(!shared){if(filters.region||filters.keyword)search({move:true});else nation();}
  if(!shared&&!sharedView&&navigator.permissions){try{const permission=await navigator.permissions.query({name:'geolocation'});if(permission.state==='granted')locate({quiet:true});}catch{}}
}catch(error){toast('지도 연결을 확인하지 못했습니다. 충전소 목록과 검색은 계속 이용할 수 있습니다.');}
setInterval(()=>{if(document.hidden)return;render();if(state.selected){const s=state.stations.find(row=>row.id===state.selected);if(s)detail(s);}},60000);
setInterval(()=>{if(!document.hidden)refresh();},300000);
