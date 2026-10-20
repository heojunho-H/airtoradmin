// AI 응답 마크다운 렌더러 (지연 로딩 청크) — react-markdown + remark-gfm(표·취소선·체크리스트).
// remark-cjk-friendly: CommonMark 는 "**50%**입니다" 처럼 닫는 ** 앞이 문장부호이고 뒤에 한글이 붙으면
// 굵게를 끝내지 못한다. 한국어 답변에서 흔한 형태라 한중일 문자에 맞게 규칙을 완화한다.
// 원시 HTML 은 렌더링하지 않고(skipHtml), 이미지는 막는다(웹 검색 결과 URL 로 정보가 새는 것 방지).
// typography 플러그인 없이 요소별 Tailwind 클래스를 직접 지정한다 — 리터럴 문자열로 둬야 Tailwind 가 인식한다.

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkCjkFriendly from 'remark-cjk-friendly';

const REMARK_PLUGINS = [remarkGfm, remarkCjkFriendly];
const DISALLOWED = ['img'];

const COMPONENTS: Components = {
  p: ({ node: _node, ...props }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0" {...props} />,
  h1: ({ node: _node, ...props }) => <h3 className="text-[22px] font-semibold text-slate-900 mt-4 mb-2 first:mt-0" {...props} />,
  h2: ({ node: _node, ...props }) => <h3 className="text-[21px] font-semibold text-slate-900 mt-4 mb-2 first:mt-0" {...props} />,
  h3: ({ node: _node, ...props }) => <h4 className="text-[20px] font-semibold text-slate-900 mt-3 mb-1.5 first:mt-0" {...props} />,
  h4: ({ node: _node, ...props }) => <h4 className="text-[19px] font-semibold text-slate-800 mt-3 mb-1.5" {...props} />,
  ul: ({ node: _node, ...props }) => <ul className="my-2 list-disc pl-5 space-y-1" {...props} />,
  ol: ({ node: _node, ...props }) => <ol className="my-2 list-decimal pl-5 space-y-1" {...props} />,
  li: ({ node: _node, ...props }) => <li className="leading-relaxed" {...props} />,
  strong: ({ node: _node, ...props }) => <strong className="font-semibold text-slate-900" {...props} />,
  a: ({ node: _node, ...props }) => (
    <a className="text-blue-600 underline underline-offset-2 hover:text-blue-700 break-all" target="_blank" rel="noopener noreferrer" {...props} />
  ),
  blockquote: ({ node: _node, ...props }) => <blockquote className="my-2 border-l-4 border-blue-200 pl-3 text-slate-600" {...props} />,
  hr: () => <hr className="my-4 border-slate-200" />,
  table: ({ node: _node, ...props }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-[18px] border-collapse" {...props} />
    </div>
  ),
  thead: ({ node: _node, ...props }) => <thead className="bg-slate-50" {...props} />,
  // props 를 펼쳐야 GFM 열 정렬(style text-align)이 유지된다
  th: ({ node: _node, ...props }) => <th className="px-3 py-2 text-left font-semibold text-slate-700 whitespace-nowrap border-b border-slate-200" {...props} />,
  td: ({ node: _node, ...props }) => <td className="px-3 py-2 align-top border-b border-slate-100 text-slate-700" {...props} />,
  code: ({ node: _node, className, children, ...props }) =>
    className ? (
      <code className={`${className} text-[17px]`} {...props}>
        {children}
      </code>
    ) : (
      <code className="rounded bg-slate-100 px-1 py-0.5 text-[17px] text-slate-800" {...props}>
        {children}
      </code>
    ),
  pre: ({ node: _node, ...props }) => <pre className="my-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-slate-100 text-[17px] leading-relaxed" {...props} />,
};

export default function Markdown({ text }: { text: string }) {
  return (
    <div className="text-[19px] text-slate-800 break-words">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS} skipHtml disallowedElements={DISALLOWED} unwrapDisallowed>
        {text.replace(/<br\s*\/?>/gi, '  \n')}
      </ReactMarkdown>
    </div>
  );
}
