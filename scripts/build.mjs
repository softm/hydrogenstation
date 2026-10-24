import {cp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import vm from 'node:vm';
import {validAdUnit} from '../public/js/ads.js';
const root=new URL('../',import.meta.url),output=new URL('dist/',root);
const m=JSON.parse(await readFile(new URL('public/data/manifest.json',root),'utf8'));
const gzip=await readFile(new URL('public/data/'+m.file.gzipPath,root));
const json=await readFile(new URL('public/data/'+m.file.path,root)).catch(()=>gunzipSync(gzip));
if(!gunzipSync(gzip).equals(json)||json.byteLength!==m.file.bytes||gzip.byteLength!==m.file.gzipBytes||createHash('sha256').update(json).digest('hex')!==m.file.sha256)throw new Error('Snapshot/gzip integrity failed');
const stations=JSON.parse(json).stations;
if(stations.length!==m.totalStations||stations.length!==m.file.count||new Set(stations.map(s=>s.id)).size!==stations.length)throw new Error('Inventory count failed');
if(m.regions.reduce((a,r)=>a+r.count,0)!==stations.length||m.regions.some(r=>stations.filter(s=>s.region===r.name).length!==r.count))throw new Error('Region totals failed');
await mkdir(output,{recursive:true});
for(const name of await readdir(output))await rm(new URL(name,output),{recursive:true,force:true});
await cp(new URL('public/',root),output,{recursive:true});
await writeFile(new URL('data/'+m.file.path,output),json);
const context={window:{}};
vm.runInNewContext(await readFile(new URL('public/config.js',root),'utf8'),context);
const config={...context.window.H2_CONFIG};
if(process.env.PUBLIC_NAVER_MAP_CLIENT_ID)config.naverMapClientId=process.env.PUBLIC_NAVER_MAP_CLIENT_ID;
if(process.env.DISABLE_NAVER_MAP==='true')config.naverMapClientId='';
// Keep data same-origin; do not permit a secret URL to be serialized.
if(config.dataBaseUrl!=='./data')throw new Error('Data must be same-origin');
await writeFile(new URL('config.js',output),'window.H2_CONFIG = Object.freeze('+JSON.stringify(config,null,2)+');\n');
vm.runInNewContext(await readFile(new URL('public/ad-config.js',root),'utf8'),context);
const ad={...context.window.H2_AD_CONFIG};
ad.placements={...ad.placements};
ad.placements.list={...ad.placements.list};
ad.placements.detail={...ad.placements.detail};
ad.placements.bottom={...ad.placements.bottom};
if(process.env.PUBLIC_ADFIT_LIST_UNIT)ad.placements.list.unit=process.env.PUBLIC_ADFIT_LIST_UNIT;
else if(process.env.PUBLIC_ADFIT_BANNER_UNIT)ad.placements.list.unit=process.env.PUBLIC_ADFIT_BANNER_UNIT;
if(process.env.PUBLIC_ADFIT_DETAIL_UNIT)ad.placements.detail.unit=process.env.PUBLIC_ADFIT_DETAIL_UNIT;
if(process.env.PUBLIC_ADFIT_BOTTOM_UNIT)ad.placements.bottom.unit=process.env.PUBLIC_ADFIT_BOTTOM_UNIT;
for(const [name,placement] of Object.entries(ad.placements)){
 if(placement.unit&&!validAdUnit(placement.unit))throw new Error(`Invalid AdFit unit: ${name}`);
}
await writeFile(new URL('ad-config.js',output),'window.H2_AD_CONFIG = Object.freeze('+JSON.stringify(ad)+');\n');
await writeFile(new URL('build-info.json',output),JSON.stringify({version:'1.0.0',builtAt:new Date().toISOString(),sourceRevision:process.env.GITHUB_SHA||null,scheduledCollectionEnabled:process.env.SCHEDULED_COLLECTION_ENABLED==='true',source:m.source.type,stationCount:m.totalStations},null,2)+'\n');
console.log(`Built dist/: ${stations.length} real H2 stations; ${json.byteLength} -> ${gzip.byteLength} bytes. gzip and SHA-256 verified.`);

// Version entry scripts and their module dependencies to avoid mixed deployments in browser caches.
const assetVersion=process.env.GITHUB_SHA||createHash('sha256').update(await readFile(new URL('public/js/data-status.js',root))).digest('hex').slice(0,12);
for(const file of await readdir(new URL('js/',output))){
 if(!file.endsWith('.js'))continue;
 const path=new URL('js/'+file,output);
 const source=await readFile(path,'utf8');
 await writeFile(path,source.replace(/(from\s*['"])(\.\.?\/[^'"?]+\.js)(['"])/g,`$1$2?v=${assetVersion}$3`));
}
for(const file of await readdir(output)){
 if(!file.endsWith('.html'))continue;
 const path=new URL(file,output);
 await writeFile(path,(await readFile(path,'utf8')).replace(/(<script[^>]+src=")([^"?]+\.js)(")/g,`$1$2?v=${assetVersion}$3`));
}
