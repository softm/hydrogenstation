export async function loadDataset(base='./data') {
  const root=new URL(base.replace(/\/?$/,'/'),document.baseURI);
  const get=async path=>{const response=await fetch(new URL(path,root),{cache:'no-store'});if(!response.ok) throw new Error('데이터 파일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');return response;};
  const manifest=await (await get('manifest.json')).json();
  if (manifest.schemaVersion!==1||!manifest.file||!Number.isInteger(manifest.totalStations)) throw new Error('데이터 목록 형식이 변경되었습니다.');
  const file=manifest.file;
  for (const name of [file.path,file.gzipPath]) if (!/^stations-[a-f0-9]{16}\.json(?:\.gz)?$/.test(name)) throw new Error('데이터 파일 경로가 올바르지 않습니다.');
  let bytes, compressedBytes=null, transport='JSON';
  if ('DecompressionStream' in window) {
    try {
      const compressed=await (await get(file.gzipPath)).arrayBuffer(); compressedBytes=compressed.byteLength;
      const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
      bytes=new Uint8Array(await new Response(stream).arrayBuffer());transport='gzip';
      if (bytes.byteLength!==file.bytes||compressedBytes!==file.gzipBytes) throw new Error('크기 불일치');
    } catch { bytes=null; }
  }
  if (!bytes) {bytes=new Uint8Array(await (await get(file.path)).arrayBuffer());transport='JSON';compressedBytes=null;}
  if (bytes.byteLength!==file.bytes) throw new Error('데이터 파일 크기가 일치하지 않습니다.');
  // HTTPS production supports WebCrypto. Plain HTTP preview can still validate counts,
  // but must never advertise a SHA verification that it did not perform.
  let hashVerified=false;
  if (globalThis.crypto?.subtle) {
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if (hash!==file.sha256) throw new Error('데이터 무결성 검사에 실패했습니다.');
    hashVerified=true;
  }
  const payload=JSON.parse(new TextDecoder().decode(bytes));
  const rows=payload.stations;
  if (!Array.isArray(rows)||rows.length!==manifest.totalStations||rows.length!==file.count||new Set(rows.map(s=>s.id)).size!==rows.length) throw new Error('충전소 건수 또는 ID가 일치하지 않습니다.');
  if (payload.observedAt!==manifest.generatedAt||rows.some(s=>s.observedAt!==payload.observedAt)) throw new Error('수집 버전이 일치하지 않습니다.');
  for (const r of manifest.regions) if (rows.filter(s=>s.region===r.name).length!==r.count) throw new Error('지역별 집계가 일치하지 않습니다.');
  if (manifest.regions.reduce((sum,r)=>sum+r.count,0)!==rows.length) throw new Error('지역 총계가 일치하지 않습니다.');
  const mapped=rows.filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lng)).length;
  if (mapped!==manifest.mappedStations) throw new Error('지도 좌표 집계가 일치하지 않습니다.');
  let collection=null;
  try {collection=await (await get('collection-status.json')).json();} catch { /* snapshot remains usable */ }
  return {manifest,stations:rows,collection,verification:{hash:hashVerified,count:true,regions:true,mapped:true,transport,compressedBytes,bytes:bytes.byteLength}};
}
