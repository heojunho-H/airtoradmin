// 단가보장 협약서 PDF Worker — Pages 의 Service binding(PDF_RENDERER)으로만 부른다(공개 주소 없음).
// 본문으로 받은 인쇄용 HTML 을 Cloudflare Browser Run(바인딩)으로 A4 PDF 로 만들어 돌려준다. API 토큰이 필요 없다.
// 호출하는 쪽: functions/_lib/mou.ts renderPdf — docs/mou.md

import puppeteer, { type BrowserWorker } from '@cloudflare/puppeteer';

interface Env {
  BROWSER: BrowserWorker;
}

const MAX_HTML = 4_000_000; // 그림이 data: URI 로 들어 있어 넉넉히

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
    const html = await request.text();
    if (!html || html.length > MAX_HTML) return new Response('bad request', { status: 400 });
    let browser: Awaited<ReturnType<typeof puppeteer.launch>>;
    try {
      browser = await puppeteer.launch(env.BROWSER);
    } catch (err) {
      // 동시 브라우저 한도 등 — Pages 쪽은 '인쇄 → PDF로 저장' 안내로 돌린다
      return new Response(`launch failed: ${err instanceof Error ? err.message : String(err)}`, { status: 503 });
    }
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
      const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
      return new Response(pdf, { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' } });
    } catch (err) {
      return new Response(`pdf failed: ${err instanceof Error ? err.message : String(err)}`, { status: 502 });
    } finally {
      await browser.close();
    }
  },
};
