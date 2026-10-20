# 수소한눈 검증 결과

확인일: 2026-10-21 KST.

| 검증 | 결과 |
|---|---|
| 최초 실제 수집 | 하잉 공개 지도 조회 응답 248곳. 좌표 248·가격 248. 전국 전체 총량은 별도 미검증 |
| 단위·계약 검사 | Node 8개 + Python 6개 = 14개 통과 |
| 정적 검사·빌드 | npm run check, npm run build 통과 |
| 압축·무결성 | 363,558 → 48,121 bytes, 약 87% 절감. 빌드에서 압축해제·SHA-256·건수·지역 집계 대조 통과 |
| 데스크톱 UI | 1363px에서 목록·지도 표시, 충남 15곳, 가격 정렬, 서산 충전소 상세, 선택 마커 1개, 닫기 후 결과 15곳과 배율 유지 확인 |
| 지도 기본 제공자 | 번들 Leaflet + 실제 OpenStreetMap 타일 로드 확인. 네이버 SDK 선택 연동은 별도 origin/인증 검증 필요 |
| 모바일 UI | 390×844 iframe에서 가로폭 390/scrollWidth 390. 승용 결과 239곳. 목록 확장 전후 결과 239곳 유지, 목록 높이 약 228→374px 확인 |
| 수집현황 UI | 실제 gzip 로드 및 전체·지역·좌표 집계 대조 확인. HTTP 내부 미리보기는 WebCrypto 미지원이어서 SHA 부분검증으로 정직하게 표기. HTTPS 배포 화면의 최종 브라우저 SHA 검증은 공개 배포 후 확인 필요 |
| 개인정보 최소화 | 원본 담당자 이름·이메일·개인전화·사업자번호 제외를 자동 검사 |
| 장애 보존 | 오류 시 원래 snapshot·수집시각 유지, 안전한 오류코드만 저장하는 테스트 통과 |
| 실제 Actions | [39514860187](https://github.com/softm/hydrogenstation/actions/runs/39514860187): 공식 공개 수집·테스트·빌드 성공. configure-pages에서 Pages site Not Found로 중단 |
| 공개 배포 | **미완료**. 새 저장소의 Pages Source 활성화가 남음. 연결된 사용자 브라우저가 끊겨 해당 설정을 대신 적용하지 못함 |
| 추가 연결 | 공공 운영·실시간 API 인증, 수소한눈 전용 AdFit 광고단위·승인, 위치 권한의 실제 사용자 승인 여부는 별도 조건 |

## 남은 한 번의 설정

1. [hydrogenstation Pages 설정](https://github.com/softm/hydrogenstation/settings/pages) 열기.
2. **Build and deployment → Source → GitHub Actions** 선택.
3. 이후 매시 7·22·37·52분 예약 실행에서 수집·배포한다. 즉시 실행하려면 최신 [Actions 실행](https://github.com/softm/hydrogenstation/actions)에서 Run workflow를 선택한다.

공개 예정 주소: https://softm.github.io/hydrogenstation/ (루트. `/dist` 사용 안 함).
