// 최소 SSE 파서 — fetch(POST) 응답 본문을 줄 단위로 읽는다 (EventSource 는 POST 를 못 쓴다).
// `: ping` 같은 주석 줄은 무시하고, 빈 줄에서 이벤트 하나를 내보낸다.

export interface SseMessage {
  event: string;
  data: string;
}

export function createSseParser(onMessage: (m: SseMessage) => void) {
  let buffer = '';
  let event = '';
  let data: string[] = [];

  const dispatch = () => {
    if (data.length) onMessage({ event: event || 'message', data: data.join('\n') });
    event = '';
    data = [];
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      let i: number;
      while ((i = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, i).replace(/\r$/, '');
        buffer = buffer.slice(i + 1);
        if (line === '') {
          dispatch();
        } else if (line[0] !== ':') {
          const colon = line.indexOf(':');
          const field = colon < 0 ? line : line.slice(0, colon);
          const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
          if (field === 'event') event = value;
          else if (field === 'data') data.push(value);
        }
      }
    },
    flush: dispatch,
  };
}
