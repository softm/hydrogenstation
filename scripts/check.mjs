import {readFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
for(const folder of ['public/js/','scripts/','tests/'])for(const file of await readdir(new URL(folder,root))){if(!/\.(mjs|js)$/.test(file))continue;const result=spawnSync(process.execPath,['--check',new URL(folder+file,root).pathname],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr);}
const html=await readFile(new URL('public/index.html',root),'utf8');
for(const required of ['data-status.html','id="map"','id="list"','id="auto-search"','id="detail"','id="locate"'])if(!html.includes(required))throw new Error('Missing UI contract: '+required);
for(const name of ['index.html','data-status.html','privacy.html']){
 const text=await readFile(new URL('public/'+name,root),'utf8');
 for(const match of text.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g))await readFile(new URL('public/'+match[1].slice(2),root));
}
for(const file of ['public/config.js','public/ad-config.js']){const text=await readFile(new URL(file,root),'utf8');if(/serviceKey\s*[:=]|HYDROGEN_SERVICE_KEY\s*[:=]/i.test(text))throw new Error('Secret in public config');}
console.log('JavaScript syntax, required pages, local asset links and public configuration passed.');
