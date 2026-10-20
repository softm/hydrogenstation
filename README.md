# 수소한눈 · hydrogenstation

[배포 예정 주소](https://softm.github.io/hydrogenstation/) · [수집현황 예정 주소](https://softm.github.io/hydrogenstation/data-status.html) · [수집·배포 실행](https://github.com/softm/hydrogenstation/actions)

**2026-10-21 검증 상태:** 앱 구현과 실제 248곳 수집·자동화 테스트·빌드는 통과했다. 첫 GitHub Actions에서도 수집·테스트·빌드에 성공했고, Pages 미활성화로 공개 배포 단계가 중단되었다. [Pages 설정](https://github.com/softm/hydrogenstation/settings/pages)의 Source를 **GitHub Actions**로 선택하면 이후 예약 실행에서 배포한다. [검증 결과](docs/VALIDATION.md)를 참고한다.

수소차 충전소를 지도에서 찾고 **원/kg 가격, 승용·버스·트럭 이용 가능 차종, 설비 표기 압력, 운영시간과 대기 현황**을 비교하는 웹앱이다. 사용자 소유 [전기차 충전소 앱](https://github.com/softm/evchargingstation)을 기반으로 별도 저장소에 구현했다. 외부 의존성 설치 없이 빌드·테스트·수집이 가능하다.

| 기능 | 구현 |
|---|---|
| 지도와 목록 | 기본 Leaflet/OSM. 네이버 공개 ID 설정 시 우선 사용하고 실패 시 OSM 전환. 실제 이동 후 목록·마커 자동 갱신, 수동 지역검색 지원 |
| 선택과 상세 | 목록↔마커 연결, 선택 마커와 가격, 팝업 가림 보정, 상세 닫기에서 위치·배율 보존, 배경 블러 없음 |
| 검색·필터 | 시설명·주소, 시도·원천 통합지역, 승용·버스·트럭, 350/700/800 bar **설비 표기**, 가격 상한, 영업 확인, 관심 충전소 |
| 정렬 | 이름·가격·직선거리·신선한 대기차수. 미제공 가격·대기차수는 뒤로 |
| 상세 | 원/kg 가격, 주간 운영표, 휴게시간, 점검/T/T교체/마감 구분, 대표전화, 네이버 길찾기·카카오맵, 충전소 링크 공유 |
| 현재 위치 | 버튼 또는 이미 허용한 권한에서만 사용. 실패·거절 시 지역 선택과 전국 조회 유지 |
| 관심 충전소 | 기기별 localStorage. 로그인·서버 저장은 범위에 포함하지 않음 |
| 데이터 | 한국석유관리원 하잉 공개 지도 응답의 허용 필드만 수집. 검증 후 원자적으로 manifest 교체 |
| 압축·신뢰성 | 내용 기반 파일명, JSON+gzip, SHA-256, 실제 압축해제·건수·지역 집계 대조 |
| 운영 | 필수 `data-status.html`, 15분 예약 수집, 실패 시 마지막 정상본 보존, 배포 성공과 수집 성공 분리 |
| 광고 | 기존 앱의 320×100 AdFit 배치/NO-AD 처리 재사용. 사이트 전용 광고단위 미설정이므로 현재 광고 요청 없음 |

## 데이터 연결

| 제공처 | 연결 상태·주기 | 비고 |
|---|---|---|
| [하잉 공개 지도](https://www.h2nbiz.or.kr/rt/sch/rtSearch.do?tabNo=1) | 기본 연결, Actions 15분 간격 1회 조회 | 공개 웹 화면의 내부 조회 경로. 공식 API의 안정성 계약과 다르며 변경 시 수집 실패로 표시 |
| [한국석유관리원 운영정보 API](https://www.data.go.kr/data/15133332/openapi.do) | 선택 연결 | 해당 API 활용 승인 필요. `B552532/h2nbiz_2/operationInfo` |
| [한국석유관리원 실시간정보 API](https://www.data.go.kr/data/15133338/openapi.do) | 선택 연결 | 해당 API 활용 승인 필요. `B552532/h2nbiz_3/currentInfo` |

최초 수집 248곳은 **해당 시점 공개 지도 조회 응답 수록 건수**다. 전국에 설치·운영·구축 중인 모든 시설의 총량으로 단정하지 않는다. 현재 건수와 수집·원천 갱신 시각은 실제 [수집현황](https://softm.github.io/hydrogenstation/data-status.html)에서 확인한다. API 승인 여부를 추정하거나 기존 EV 서비스 승인으로 대신하지 않는다.

실시간 추천은 **수집 확인 시각과 원천 설비 갱신 시각이 모두 15분 이내**인 경우로 제한한다. 운영상태 변경 시각은 heartbeat가 아니므로 최신성의 근거로 쓰지 않는다. 공공 실시간 API의 `last_mdfcn_dt`도 문서상 운영상태갱신일자이므로 heartbeat로 확인되기 전에는 보수적으로 미확인 표시한다. 대기시간·완충대수·잔량은 원시 압력에서 추정하지 않는다.

공개 원본에 포함된 담당자 이름·개인전화·이메일·사업자번호·등록/수정자 계정은 저장하지 않는다. 공개 시설명·대표번호·주소 등 명시 허용 필드만 배포한다.

## 실행

```bash
npm run collect
npm run check
npm test
npm run build
# dist를 정적 서버에서 열기
python3 -m http.server 8080 --directory dist
```

## 배포·설정

- GitHub Pages Source: **GitHub Actions**. `collect-and-deploy.yml` 하나만 배포한다. 운영 주소에 `/dist`를 붙이지 않는다.
- 매시 7·22·37·52분 예약 실행. GitHub 정책에 따라 실행이 지연·누락될 수 있다. 앱은 5분마다 정적 배포본을 확인하며 상태의 신선도를 매분 재평가한다. 브라우저가 외부 데이터 API를 직접 호출하지 않는다.
- 수동 복구: Actions → **Collect hydrogen stations and deploy Pages** → Run workflow. 일반 운영을 위해 사용자가 수동 실행할 필요는 없다.
- 공공 API 전환: 두 서비스의 활용 승인을 받은 동일 공공데이터 키를 [Actions Secrets](https://github.com/softm/hydrogenstation/settings/secrets/actions)의 `HYDROGEN_SERVICE_KEY`에 등록. 키가 있으면 운영·실시간 API 두 요청을 사용하며, 승인/총계 검증 실패 시 공개 경로로 몰래 전환하지 않고 실패를 표시한다.
- 공개 Variables: `PUBLIC_NAVER_MAP_CLIENT_ID`(선택 설정), `PUBLIC_ADFIT_BANNER_UNIT`(수소한눈 전용으로 발급된 320×100 단위). 원본 앱의 광고 ID를 복제하지 않았다.
- 긴급 예약 일시중지: Variable `PAUSE_H2_COLLECTION=true`. push·수동 실행은 계속 가능.
- 무료 공공 API의 실제 한도·이용 정책은 신청 계정의 승인 화면 기준으로 확인한다. 15분마다 두 API는 1일 192요청이며, push·수동 재실행은 별도다.

자세한 계약·제한은 [데이터 운영 문서](docs/DATA_PIPELINE.md), 소스 출처는 [재사용 기록](docs/SOURCE_REUSE.md)에 기록했다.
