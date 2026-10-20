import test from 'node:test';
import assert from 'node:assert/strict';
import {statusOf,queryStations,distanceKm,todayHours} from '../public/js/domain.js';
import {buildMarkerModels,markerHtml,createViewportGate} from '../public/js/map.js';
const now=Date.parse('2026-10-21T01:00:00Z');
const fixture={id:'001HSABC',name:'가 충전소',address:'충남 서산',region:'충남',lat:36.8,lng:126.4,vehicles:['car'],pricePerKg:9900,statusLabel:'여유',operationCode:'0',waitingTotal:0,observedAt:'2026-10-21T00:59:00Z',upstreamCheckedAt:'2026-10-21T00:58:00Z'};
test('zero waiting cars is known; missing, stale, future timestamps cannot confirm open',()=>{
  assert.equal(statusOf(fixture,now).queue,0);assert.equal(statusOf(fixture,now).open,true);
  for(const upstreamCheckedAt of [null,'2026-10-20T00:00:00Z','2026-10-21T02:00:00Z']){
    const s=statusOf({...fixture,upstreamCheckedAt},now);assert.equal(s.open,false);assert.equal(s.queue,null);assert.equal(s.tone,'unknown');
  }
  assert.equal(statusOf({...fixture,observedAt:'2026-10-20T00:00:00Z'},now).open,false);
});
test('maintenance, closed and TT replacement override queue and general open status',()=>{
  for(const operationCode of ['1','2','3','9'])assert.equal(statusOf({...fixture,operationCode},now).open,false);
  for(const statusLabel of ['영업마감','휴무','설비점검','T/T교체'])assert.equal(statusOf({...fixture,statusLabel},now).queue,null);
  assert.equal(statusOf({...fixture,operationCode:'2'},now).label,'설비점검');
});
test('vehicle filter excludes bus-only and unknown; zero/missing price sorts last',()=>{
  const rows=[fixture,{...fixture,id:'bus',vehicles:['bus'],pricePerKg:8500},{...fixture,id:'unknown',vehicles:[],pricePerKg:0},{...fixture,id:'missing',name:'나',pricePerKg:null}];
  assert.deepEqual(queryStations(rows,{vehicle:'car',sort:'price'},{now}).map(x=>x.id),['001HSABC','missing']);
  assert.equal(queryStations(rows,{vehicle:'truck'},{now}).length,0);
  assert.equal(queryStations(rows,{maxPrice:10000},{now}).length,2);
});
test('bounds refresh list; favorites do not bypass vehicle or viewport filters',()=>{
  const bounds={south:36,north:37,west:126,east:127};
  assert.equal(queryStations([fixture],{viewport:true},{bounds,now}).length,1);
  assert.equal(queryStations([fixture],{viewport:true},{bounds:{...bounds,west:128},now}).length,0);
  assert.equal(queryStations([fixture],{favorite:true},{favorites:new Set(['001HSABC']),now}).length,1);
  assert.equal(queryStations([fixture],{vehicle:'bus',favorite:true},{favorites:new Set(['001HSABC']),now}).length,0);
});
test('map selection preserves result list until a real user move',()=>{
  const gate=createViewportGate();gate.preserve();gate.resize();assert.equal(gate.consume(),false);gate.userChange();assert.equal(gate.consume(),true);assert.equal(gate.consume(),false);
});
test('H2 markers show price rather than EV charger count and escape provider fields',()=>{
  const s={...fixture,name:'<img src=x onerror=alert(1)>'};
  const [model]=buildMarkerModels([s],{summaries:new Map([[s.id,{tone:'available',label:'여유'}]])});
  const html=markerHtml(model);assert.match(html,/9,900/);assert.match(html,/원\/kg/);assert.doesNotMatch(html,/<img/);assert.doesNotMatch(html,/총 .*기/);
});
test('KST weekday, explicit rest day and unknown hours remain distinct',()=>{
  const s={hours:{wed:{start:'08:00',end:'22:00'},thu:{start:null,end:null},sun:{enabled:false}}};
  assert.equal(todayHours(s,new Date('2026-10-20T23:00:00Z')),'08:00–22:00');
  assert.equal(todayHours(s,new Date('2026-10-24T23:00:00Z')),'정기 휴무');
  assert.ok(distanceKm({lat:37.5,lng:127},fixture)>0);
});
