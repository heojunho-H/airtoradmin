// Anthropic API 중계 Worker.
// Pages Functions 는 요청을 받은 Cloudflare 데이터센터에서 실행된다. 한국 트래픽 일부가 홍콩(HKG)으로 가는데
// 홍콩은 Anthropic 지원 지역이 아니라서 403 {"type":"forbidden","message":"Request not allowed"} 로 거부된다
// (2026-11-04 확인: HKG 실패, NRT 성공 — 모델과 무관).
// 이 Worker 는 wrangler.toml 의 placement 로 미국 동부에서 실행되어 api.anthropic.com 에 그대로 전달한다.
// 공개 주소가 없고(workers_dev=false) Pages 의 Service binding(ANTHROPIC_RELAY)으로만 호출된다.

const UPSTREAM_HOST = 'api.anthropic.com';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // 배포 확인용 — 이 Worker 가 실제로 나가는 위치(colo=IAD 등)
    if (url.pathname === '/__relay/trace') {
      const r = await fetch('https://www.cloudflare.com/cdn-cgi/trace');
      return new Response(await r.text(), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    if (url.protocol !== 'https:' || url.hostname !== UPSTREAM_HOST) {
      return new Response('forbidden', { status: 403 });
    }
    // 메서드·헤더(x-api-key, anthropic-beta 등)·본문을 그대로 넘기고, 응답(SSE 포함)도 그대로 흘려보낸다
    return fetch(request);
  },
};
