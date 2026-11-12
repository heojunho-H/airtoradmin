// Cloudflare Pages Function — /api/deals 프록시
// 프론트엔드 → 같은 도메인(/api/deals) → Cafe24 서버로 전달 (CORS 우회)

// v2: 부분 수정 + 딜·고객·프로젝트 동기화 (api/sync_lib.php, docs/data-sync.md). 되돌리려면 deals_api.php 로.
import { recordWon, wonDealIdFromResponse } from '../_lib/ads-feed';

const TARGET = 'https://airtor.co.kr/api/deals_api_v2.php';

interface Env {
  AI_DB?: D1Database;
}

type Ctx = Parameters<PagesFunction<Env>>[0];

async function proxyRequest(context: Ctx): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const targetUrl = TARGET + url.search;

  const response = await fetch(targetUrl, {
    method: request.method,
    headers: { 'Content-Type': 'application/json' },
    body: request.method !== 'GET' ? await request.text() : undefined,
  });

  const data = await response.text();

  // 계약 성공 전환 시각 기록 — 구글 광고 계약 업로드(functions/_lib/ads-feed.ts). 응답·저장에는 영향 없음.
  if ((request.method === 'PUT' || request.method === 'POST') && env.AI_DB) {
    const wonId = wonDealIdFromResponse(data);
    if (wonId) {
      context.waitUntil(recordWon(env.AI_DB, wonId).catch((e) => console.error('[deals] ads won record failed', String(e).slice(0, 200))));
    }
  }

  return new Response(data, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export const onRequestGet: PagesFunction<Env> = async (context) => proxyRequest(context);
export const onRequestPost: PagesFunction<Env> = async (context) => proxyRequest(context);
export const onRequestPut: PagesFunction<Env> = async (context) => proxyRequest(context);
export const onRequestDelete: PagesFunction<Env> = async (context) => proxyRequest(context);

// OPTIONS preflight 처리
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
