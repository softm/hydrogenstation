"""SOFTM-H2 20261021: Whitelist-only official H2 collector. No dependencies."""
import argparse
import collections
import datetime as dt
import gzip
import hashlib
import json
import math
import os
import pathlib
import re
import sys
import urllib.parse
import urllib.request

KST = dt.timezone(dt.timedelta(hours=9))
PUBLIC_URL = 'https://www.h2nbiz.or.kr/rt/sts/inf/getAjaxChrstnList.do'
SOURCE_URL = 'https://www.h2nbiz.or.kr/rt/sch/rtSearch.do?tabNo=1'
OP_URL = 'https://apis.data.go.kr/B552532/h2nbiz_2/operationInfo'
LIVE_URL = 'https://apis.data.go.kr/B552532/h2nbiz_3/currentInfo'
REGIONS = {'서울특별시':'서울','서울':'서울','부산광역시':'부산','부산':'부산','대구광역시':'대구','대구':'대구','인천광역시':'인천','인천':'인천','광주광역시':'광주','광주':'광주','대전광역시':'대전','대전':'대전','울산광역시':'울산','울산':'울산','세종특별자치시':'세종','세종':'세종','경기도':'경기','경기':'경기','강원특별자치도':'강원','강원도':'강원','강원':'강원','충청북도':'충북','충북':'충북','충청남도':'충남','충남':'충남','전북특별자치도':'전북','전라북도':'전북','전북':'전북','전라남도':'전남','전남':'전남','경상북도':'경북','경북':'경북','경상남도':'경남','경남':'경남','제주특별자치도':'제주','제주도':'제주','제주':'제주'}
REGIONS['전남광주통합특별시'] = '전남·광주'
DAYS = ['mon','tues','wed','thur','fri','sat','sun','hldy']

def utcnow():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')

def text(value):
    return str(value).strip() if value is not None else ''

def number(value, *, integer=False, positive=False):
    if value is None or isinstance(value, bool) or not text(value):
        return None
    try:
        value = float(text(value).replace(',',''))
        if not math.isfinite(value) or value < 0 or (positive and value == 0):
            return None
        if integer and value != int(value):
            return None
        return int(value) if integer else value
    except (ValueError, TypeError):
        return None

def iso_time(value):
    value = text(value)
    if not value:
        return None
    try:
        if re.fullmatch(r'\d{12,14}', value):
            parsed = dt.datetime.strptime(value, '%Y%m%d%H%M%S' if len(value)==14 else '%Y%m%d%H%M').replace(tzinfo=KST)
        else:
            parsed = dt.datetime.fromisoformat(value.replace('Z','+00:00'))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=KST)
        return parsed.astimezone(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
    except ValueError:
        return None

def clock(value):
    value = text(value)
    if re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d|24:00',value):
        return value
    if re.fullmatch(r'\d{4}',value):
        return clock(value[:2]+':'+value[2:])
    return None

def camel(name):
    return re.sub(r'_([a-z])', lambda m:m[1].upper(),name)

def normalize(raw, observed_at, source='public-map'):
    # Never retain whole raw objects: they contain manager contact details.
    row = {camel(k):v for k,v in raw.items()}
    sid, name = text(row.get('chrstnMno')), text(row.get('chrstnNm'))
    if not sid or not name:
        raise ValueError('MISSING_STATION_ID_OR_NAME')
    addr = text(row.get('roadNmAddr') or row.get('chrstnAddr') or row.get('lotnoAddr'))
    lat = number(row.get('let') or row.get('lat'),positive=True)
    lng = number(row.get('lon') or row.get('lng'),positive=True)
    point = re.fullmatch(r'POINT\s*\(\s*([\d.]+)\s+([\d.]+)\s*\)',text(row.get('geom')),re.I)
    if point:
        lng,lat = map(float,point.groups())
    if lat is None or lng is None or not (32<=lat<=40 and 123<=lng<=133):
        lat = lng = None
    vehicle = text(row.get('vhcleKndNm'))
    vehicle_code = text(row.get('vhcleKndCd'))
    vehicles = [v for v,word in [('car','승용'),('bus','버스'),('truck','트럭')] if word in vehicle]
    if not vehicles:
        vehicles = {'01':['car'],'03':['bus'],'05':['car','bus'],'06':['car','bus','truck']}.get(vehicle_code,[])
    hours = {}
    day_flags = text(row.get('usePosblDotw'))
    for idx,day in enumerate(DAYS):
        opened,closed = clock(row.get(camel('usebhr_hr_'+day))),clock(row.get(camel('useehr_hr_'+day)))
        hours[day] = {'start':opened,'end':closed,'enabled':day_flags[idx]=='1' if len(day_flags)==8 else None}
    wait_label = text(row.get('waitVhcleAlge')) if source=='public-map' else ''
    op_code = text(row.get('operSttusCd'))
    live_at = iso_time(row.get('eqpLastMdfcnDt')) if source=='public-map' else None
    pressure_label = text(row.get('chrgrTyNm'))
    pressure_match = re.search(r'\b(350|700|800)\s*bar\b',pressure_label,re.I)
    return {
        'id':sid,'name':name,'address':addr,'region':REGIONS.get(addr.split(' ')[0], '지역 미상'),
        'lat':lat,'lng':lng,'phone':re.sub(r'[^\d+\-() ]','',text(row.get('chrstnCttpc'))),
        'pricePerKg':number(row.get('ntslPc'),positive=True), 'priceObservedAt':observed_at,
        'vehicles':vehicles,'vehicleLabel':vehicle or '제공 차종 미확인',
        'equipmentPressureBar':int(pressure_match[1]) if pressure_match else None,'pressureLabel':pressure_label or '설비 압력 미제공',
        'stationType':text(row.get('chrstnTyNm')),'equipmentType':text(row.get('echrgeqpTyNm')),
        'hours':hours,'breakTime':{'start':clock(row.get('restBgngHr')),'end':clock(row.get('restEndHr'))},
        'payment':text(row.get('setleMthdNm')),'notice':text(row.get('eventCn')),
        'statusLabel':wait_label or text(row.get('operSttusNm')) or '상태 미확인',
        'operationCode':op_code,'operationLabel':text(row.get('operSttusNm')),
        'waitingCars':number(row.get('waitCarAlgeCnt'),integer=True),
        'waitingBuses':number(row.get('waitBusAlgeCnt'),integer=True),
        'waitingTotal':number(row.get('waitVhcleAlgeCnt'),integer=True),
        'upstreamCheckedAt':live_at,'operationChangedAt':iso_time(row.get('operLastMdfcnDt')),
        'observedAt':observed_at,'source':source
    }

def request_json(url, body=None):
    req=urllib.request.Request(url,data=json.dumps(body).encode() if body is not None else None,
        headers={'User-Agent':'hydrogenstation/1.0 (+https://github.com/softm/hydrogenstation)',
                 'Accept':'application/json','Content-Type':'application/json','Referer':SOURCE_URL})
    with urllib.request.urlopen(req,timeout=40) as response:
        if int(response.headers.get('Content-Length','0'))>15_000_000:
            raise ValueError('RESPONSE_TOO_LARGE')
        body=response.read(15_000_001)
        if len(body)>15_000_000:
            raise ValueError('RESPONSE_TOO_LARGE')
        return json.loads(body)

def api_items(payload):
    root=payload.get('response',payload)
    header=root.get('header',{})
    if text(header.get('resultCode')) not in ['00','0','0000','200']:
        raise ValueError('OFFICIAL_API_REJECTED')
    body=root.get('body',{})
    items=body.get('items',{})
    rows=items.get('item',[]) if isinstance(items,dict) else items
    if isinstance(rows,dict): rows=[rows]
    if not isinstance(rows,list) or int(body.get('totalCount',-1))!=len(rows):
        # No pagination is documented in the verified operation. Never invent it.
        raise ValueError('API_TOTAL_COUNT_MISMATCH')
    return rows

def fetch_official_api(key):
    query=urllib.parse.urlencode({'serviceKey':urllib.parse.unquote(key)})
    operations=api_items(request_json(OP_URL+'?'+query))
    currents=api_items(request_json(LIVE_URL+'?'+query))
    return operations,currents

def merge_api(operations,currents,now):
    live={text(r.get('chrstn_mno')):r for r in currents}
    if len(live)!=len(currents): raise ValueError('DUPLICATE_LIVE_ID')
    result=[]
    for raw in operations:
        if text(raw.get('del_at')).upper()=='Y': continue
        station=normalize(raw,now,'official-api')
        current=live.get(station['id'])
        if current:
            station.update(statusLabel=text(current.get('oper_sttus_nm')) or '상태 미확인',
                operationCode=text(current.get('oper_sttus_cd')),operationLabel=text(current.get('oper_sttus_nm')),
                waitingTotal=number(current.get('wait_vhcle_alge'),integer=True),
                operationChangedAt=iso_time(current.get('last_mdfcn_dt')),
                # Documented as status-change date, not a heartbeat. Do not certify freshness.
                upstreamCheckedAt=None,
                congestionLabel=text(current.get('cnf_sttus_nm')))
        result.append(station)
    return result

def validate(rows):
    if not rows or len(rows)>10000: raise ValueError('INVALID_STATION_COUNT')
    ids=[r['id'] for r in rows]
    if len(ids)!=len(set(ids)): raise ValueError('DUPLICATE_STATION_ID')
    if sum(r['lat'] is not None for r in rows)<len(rows)*0.8: raise ValueError('COORDINATE_COVERAGE_TOO_LOW')

def write_json(path,value):
    tmp=path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n')
    tmp.replace(path)

def publish(rows,output,now,source,previous=None):
    validate(rows)
    # Large drops need a deliberate full inventory investigation, not silent deletion.
    if previous and previous.get('source',{}).get('type')==source and len(rows)<previous.get('totalStations',0)*0.75:
        raise ValueError('UNEXPECTED_INVENTORY_DROP')
    rows.sort(key=lambda r:r['id'])
    data=(json.dumps({'schemaVersion':1,'observedAt':now,'stations':rows},ensure_ascii=False,separators=(',',':'))+'\n').encode()
    sha=hashlib.sha256(data).hexdigest()
    filename='stations-'+sha[:16]+'.json'
    compressed=gzip.compress(data,mtime=0)
    if gzip.decompress(compressed)!=data: raise ValueError('GZIP_VALIDATION_FAILED')
    output.mkdir(parents=True,exist_ok=True)
    (output/filename).write_bytes(data)
    (output/(filename+'.gz')).write_bytes(compressed)
    regions=[]
    for region,count in sorted(collections.Counter(r['region'] for r in rows).items()):
        subset=[r for r in rows if r['region']==region]
        regions.append({'name':region,'count':count,'mapped':sum(r['lat'] is not None for r in subset),'priced':sum(r['pricePerKg'] is not None for r in subset)})
    manifest={'schemaVersion':1,'mode':'collected','generatedAt':now,'totalStations':len(rows),
        'mappedStations':sum(r['lat'] is not None for r in rows),'pricedStations':sum(r['pricePerKg'] is not None for r in rows),
        'regions':regions,'freshnessThresholdSeconds':900,
        'source':{'name':'한국석유관리원 · 하잉','url':SOURCE_URL,'type':source,
            'coverage':'공개 지도 조회 응답 전체. 전국 시설 전체와 별도 대조되지 않음.' if source=='public-map' else '운영정보 API 응답 전체. 제공기관 수록 범위 기준.',
            'nationalInventoryVerified':False},
        'file':{'path':filename,'gzipPath':filename+'.gz','count':len(rows),'bytes':len(data),'gzipBytes':len(compressed),'sha256':sha},
        'schedule':{'intervalMinutes':15,'engine':'GitHub Actions','bestEffort':True},
        'warnings':[]}
    # Manifest last: consumers always have a complete immutable content-addressed file.
    write_json(output/'manifest.json',manifest)
    write_json(output/'collection-status.json',{'lastAttemptAt':now,'lastSuccessAt':now,'outcome':'success','source':source,'count':len(rows)})
    for old in output.glob('stations-*.json*'):
        if old.name not in [filename,filename+'.gz']: old.unlink()
    return manifest

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',default='public/data')
    parser.add_argument('--input',help='Locally fetched public-map response, for initial import or tests')
    args=parser.parse_args()
    output=pathlib.Path(args.output);output.mkdir(parents=True,exist_ok=True)
    prev=json.loads((output/'manifest.json').read_text()) if (output/'manifest.json').exists() else None
    now=utcnow()
    try:
        key=os.environ.get('HYDROGEN_SERVICE_KEY','').strip()
        if key and not args.input:
            operations,currents=fetch_official_api(key)
            rows=merge_api(operations,currents,now);source='official-api'
        else:
            payload=json.loads(pathlib.Path(args.input).read_text()) if args.input else request_json(PUBLIC_URL,{})
            if not isinstance(payload.get('data'),list): raise ValueError('PUBLIC_RESPONSE_CONTRACT_CHANGED')
            rows=[normalize(r,now) for r in payload['data']];source='public-map'
        manifest=publish(rows,output,now,source,prev)
        print(json.dumps({'status':'success','count':manifest['totalStations'],'source':source,'bytes':manifest['file']['bytes'],'gzipBytes':manifest['file']['gzipBytes']}))
        return 0
    except Exception as error:
        # Do not print urllib exceptions or raw provider messages: URLs may contain keys.
        code=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z_]+',str(error)) else 'SOURCE_UNAVAILABLE'
        write_json(output/'collection-status.json',{'lastAttemptAt':now,'lastSuccessAt':prev.get('generatedAt') if prev else None,'outcome':'failure','code':code})
        print(json.dumps({'status':'failure','code':code,'previousSnapshotPreserved':bool(prev)}),file=sys.stderr)
        return 1

if __name__=='__main__':
    sys.exit(main())
