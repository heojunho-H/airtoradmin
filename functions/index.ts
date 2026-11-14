// Cloudflare Pages Function — / (첫 화면)
// docs.airtor.co.kr 는 고객이 협약서(/mou/...)를 여는 주소다. 주소만 남겨 들어온 고객은 홈페이지로 보낸다.
// 그 밖의 호스트(airtoradmin.co.kr·pages.dev)는 지금처럼 관리 앱(SPA)을 그대로 준다.

const DOCS_HOST = 'docs.airtor.co.kr';

export const onRequest: PagesFunction = async (context) => {
  if (new URL(context.request.url).hostname === DOCS_HOST) {
    return new Response(null, { status: 302, headers: { Location: 'https://www.airtor.co.kr/', 'Cache-Control': 'no-store' } });
  }
  return context.next();
};
