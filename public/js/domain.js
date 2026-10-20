// SOFTM-H2 20261021: H2 semantics. Source observation and upstream freshness differ.
export const REGION_ORDER = ['서울','경기','인천','강원','충북','충남','대전','세종','전북','전남','광주','전남·광주','경북','경남','대구','울산','부산','제주'];
export const finiteValue = value => typeof value === 'number' && Number.isFinite(value);
export const hasPrice = s => finiteValue(s.pricePerKg) && s.pricePerKg > 0;
export const priceText = s => hasPrice(s) ? Math.round(s.pricePerKg).toLocaleString('ko-KR') : '가격 미제공';
export function ageSeconds(value, now = Date.now()) {
  const date = Date.parse(value);
  return Number.isFinite(date) ? (now - date) / 1000 : Infinity;
}
export function statusOf(station, now = Date.now(), threshold = 900) {
  const sampleAge = ageSeconds(station.observedAt,now), upstreamAge = ageSeconds(station.upstreamCheckedAt,now);
  const fresh = sampleAge >= -120 && sampleAge <= threshold && upstreamAge >= -120 && upstreamAge <= threshold;
  const label = station.statusLabel || '상태 미확인';
  const closed = /마감|휴무|점검|교체|고장|중지|정지/.test(label) || ['1','2','3','9'].includes(station.operationCode);
  let knownLabel = label;
  if (station.operationCode === '2') knownLabel = '설비점검';
  else if (station.operationCode === '3') knownLabel = 'T/T교체';
  else if (station.operationCode === '1') knownLabel = '영업중지';
  const open = fresh && !closed && /여유|보통|혼잡|영업중/.test(label);
  const queue = open && Number.isInteger(station.waitingTotal) && station.waitingTotal >= 0 ? station.waitingTotal : null;
  const tone = !fresh ? 'unknown' : closed ? 'unavailable' : open ? (/혼잡/.test(label) ? 'busy' : /보통/.test(label) ? 'moderate' : 'available') : 'unknown';
  return {fresh, open, queue, tone, label:fresh ? knownLabel : '확인 지연', previousLabel:knownLabel};
}
export function distanceKm(a,b) {
  if (![a?.lat,a?.lng,b?.lat,b?.lng].every(finiteValue)) return null;
  const rad=x=>x*Math.PI/180, dlat=rad(b.lat-a.lat), dlng=rad(b.lng-a.lng);
  const h=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlng/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function within(bounds,s) {
  return Boolean(bounds && finiteValue(s.lat) && finiteValue(s.lng) && s.lat>=bounds.south && s.lat<=bounds.north && s.lng>=bounds.west && s.lng<=bounds.east);
}
export function queryStations(stations,filters,{bounds=null,origin=null,now=Date.now(),favorites=new Set()}={}) {
  const keyword=(filters.keyword||'').trim().normalize('NFKC').toLocaleLowerCase('ko-KR');
  const result=stations.filter(s=>{
    if (keyword && ![s.name,s.address].join(' ').normalize('NFKC').toLocaleLowerCase('ko-KR').includes(keyword)) return false;
    if (filters.region && s.region!==filters.region) return false;
    if (filters.vehicle && !s.vehicles.includes(filters.vehicle)) return false;
    if (filters.pressure && s.equipmentPressureBar!==Number(filters.pressure)) return false;
    if (filters.open && !statusOf(s,now).open) return false;
    if (filters.favorite && !favorites.has(s.id)) return false;
    if (filters.maxPrice && (!hasPrice(s)||s.pricePerKg>Number(filters.maxPrice))) return false;
    if (filters.viewport && bounds && !within(bounds,s)) return false;
    return true;
  });
  const numberOrLast=n=>finiteValue(n)?n:Infinity;
  result.sort((a,b)=>{
    let diff=0;
    if (filters.sort==='price') diff=numberOrLast(a.pricePerKg>0?a.pricePerKg:null)-numberOrLast(b.pricePerKg>0?b.pricePerKg:null);
    if (filters.sort==='distance') diff=numberOrLast(distanceKm(origin,a))-numberOrLast(distanceKm(origin,b));
    if (filters.sort==='queue') diff=numberOrLast(statusOf(a,now).queue)-numberOrLast(statusOf(b,now).queue);
    return (Number.isNaN(diff)?0:diff) || a.name.localeCompare(b.name,'ko-KR');
  });
  return result;
}
export function formatTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '미제공';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
}
export function todayHours(station,now=new Date()) {
  const day=new Date(now.getTime()+9*3600000).getUTCDay();
  const h=station.hours?.[['sun','mon','tues','wed','thur','fri','sat'][day]];
  if (h?.enabled===false) return '정기 휴무';
  return h?.start&&h?.end ? `${h.start}–${h.end}` : '운영시간 미제공';
}
export function regionCenter(stations) {
  const rows=stations.filter(s=>finiteValue(s.lat)&&finiteValue(s.lng));
  if (!rows.length) return null;
  return {lat:rows.reduce((sum,s)=>sum+s.lat,0)/rows.length,lng:rows.reduce((sum,s)=>sum+s.lng,0)/rows.length};
}
