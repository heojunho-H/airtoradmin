// AI 설정(모델 목록 + 기능별 설정) — 모듈 캐시를 공유한다. 설정 화면에서 저장하면 reload() 로 모두 갱신.

import { useCallback, useEffect, useState } from 'react';
import { getConfig, toAiRequestError } from '../../../lib/ai/api';
import type { AiConfig } from '../../../lib/ai/types';

const STALE_MS = 5 * 60 * 1000;

let cache: { config: AiConfig; at: number } | null = null;
let inflight: Promise<AiConfig> | null = null;
const listeners = new Set<(c: AiConfig | null, error: string | null) => void>();

async function load(force = false): Promise<AiConfig> {
  if (!force && cache && Date.now() - cache.at < STALE_MS) return cache.config;
  if (inflight) return inflight;
  inflight = getConfig()
    .then((config) => {
      cache = { config, at: Date.now() };
      listeners.forEach((l) => l(config, null));
      return config;
    })
    .catch((err) => {
      const message = toAiRequestError(err).message;
      listeners.forEach((l) => l(cache?.config ?? null, message));
      throw err;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useAiConfig() {
  const [config, setConfig] = useState<AiConfig | null>(cache?.config ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    const listener = (c: AiConfig | null, e: string | null) => {
      setConfig(c);
      setError(e);
      setLoading(false);
    };
    listeners.add(listener);
    load().catch(() => {});
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    return load(true).catch(() => null);
  }, []);

  return { config, error, loading, reload };
}
