// 구글 데이터 관리 도구의 HTTPS 연결은 주소가 '.csv' 또는 '.tsv' 로 끝나야 받는다(2026-11-13 확인).
// 같은 피드(GET, Basic 인증 ADS_FEED_USER · ADS_FEED_PASS)를 /api/ads_conversions.csv 로도 연다.
// 동작은 ./ads_conversions.ts 와 같다. 관리자 PIN 으로 받는 POST(설정 카드)는 원래 주소만 쓴다.
export { onRequestGet, onRequestOptions } from './ads_conversions';
