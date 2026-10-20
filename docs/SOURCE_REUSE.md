# 소스 재사용 기록

2026-10-21. 사용자가 소유한 전기차 앱을 기반으로 수소차 앱을 별도 저장소에 만들라는 요청에 따른 작업이다. 기존 저장소는 변경하지 않았다.

| 항목 | 원본과 적용 |
|---|---|
| 기준 EV 저장소 | [softm/evchargingstation](https://github.com/softm/evchargingstation), 확인 main `9b028b9c31897678a7fded1bf77e545dade68311` |
| `public/js/map.js` | 네이버/Leaflet 대체 지도, 영역 자동 갱신, 선택 보존, 핀·라벨 배치 재사용. H2 전용 상태·원/kg 가격·확대별 밀도로 변경 |
| `public/vendor/homecare/care-popup-geometry.js` | EV 앱이 재사용하던 돌봄한눈 원본 유지. 상세 패널 가림 보정 |
| `public/vendor/homecare/map-marker-placement.js` | EV 앱이 재사용하던 돌봄한눈 원본 유지. 라벨 충돌·표시량 제어 |
| 돌봄한눈 출처 | [homecare-nationwide-care-services-map](https://github.com/softm/homecare-nationwide-care-services-map), EV 기록상 `6c3a1fa7a4283f8b53dc0ca6ff5bc9643c45e16d` |
| `public/js/ads.js`, `public/css/ads.css` | 비동기 AdFit·실패/NO-AD·고정 슬롯 구조 재사용. 운영 경로만 수소 앱으로 변경. 광고단위 ID는 가져오지 않음 |
| 새 작성 | 수소 도메인, 화면, 수집기, gzip 데이터, manifest, 수집현황, 검증, 테스트, 독립 배포 워크플로 |
| 복사 제외 | EV 실제 데이터·예제·API 키·계정 정보·인증 파일·기존 광고단위 |

기본 지도는 Leaflet 1.9.4 + OSM이다. Leaflet 배포본과 MIT LICENSE를 public/vendor/leaflet에 포함해 CDN 오류 시에도 SDK를 불러올 수 있다. 사용자가 네이버 공개 Application Key ID를 설정하면 우선 사용하며 실패하면 OSM으로 전환한다. 임의 공개 소스 라이선스를 만들어 표시하지 않는다.
