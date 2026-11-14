// 상단 검색 — 회사명·담당자명·전화번호로 고객 / 영업 딜 / 프로젝트를 찾아, 고르면 그 상세를 바로 연다.
// 자리와 모양은 예전 검색칸 그대로(예전에는 입력해도 아무 일이 없었다). App 이 불러 둔 목록만 쓴다(서버 호출 없음).
// 키보드: ↑↓ 이동 · Enter 열기 · Esc 닫기.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Building2, Calculator, Search, TrendingUp } from 'lucide-react';
import { normalizeCompanyName } from '../../lib/company';
import { RESULT_LABELS, STAGE_LABELS } from '../../lib/ai/snapshot/common';

type Kind = 'customer' | 'deal' | 'project';

interface Hit {
  kind: Kind;
  id: number;
  title: string;
  sub: string;
}

interface GlobalSearchProps {
  customers: any[];
  deals: any[];
  projects: any[];
  onOpenCustomer: (id: number) => void;
  onOpenDeal: (id: number) => void;
  onOpenProject: (id: number) => void;
}

const PER_KIND = 5;
const KIND_LABEL: Record<Kind, string> = { customer: '고객', deal: '영업 딜', project: '프로젝트' };
const KIND_ICON = { customer: Building2, deal: TrendingUp, project: Calculator } as const;

const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/\s+/g, '');
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

function matcher(query: string) {
  const q = norm(query);
  const qCompany = normalizeCompanyName(query).toLowerCase();
  const qDigits = digits(query);
  return {
    text: (...values: unknown[]) => values.some((v) => {
      const s = norm(v);
      return !!s && (s.includes(q) || (!!qCompany && normalizeCompanyName(String(v ?? '')).toLowerCase().includes(qCompany)));
    }),
    phone: (...values: unknown[]) => qDigits.length >= 3 && values.some((v) => digits(v).includes(qDigits)),
  };
}

export function GlobalSearch({ customers, deals, projects, onOpenCustomer, onOpenDeal, onOpenProject }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim();
    if (!q) return [];
    const m = matcher(q);
    const companyById = new Map<number, string>(customers.map((c) => [Number(c.id), String(c.company || '')]));
    const dealById = new Map<number, any>(deals.map((d) => [Number(d.id), d]));

    const customerHits: Hit[] = customers
      .filter((c) => {
        const contacts = Array.isArray(c.contacts) ? c.contacts : [];
        return (
          m.text(c.company, c.contactName, ...contacts.map((p: any) => p?.name)) ||
          m.phone(c.phone, ...contacts.map((p: any) => p?.phone))
        );
      })
      .slice(0, PER_KIND)
      .map((c) => ({
        kind: 'customer' as const,
        id: Number(c.id),
        title: String(c.company || '-'),
        sub: [/^[SAB]$/.test(String(c.grade)) ? `${c.grade}등급` : '', c.contactName, c.accountManager ? `담당 ${c.accountManager}` : '']
          .filter(Boolean)
          .join(' · '),
      }));

    const dealHits: Hit[] = deals
      .filter((d) => m.text(d.company, d.contactName, d.email) || m.phone(d.phone))
      .sort((a, b) => String(b.registrationDate || '').localeCompare(String(a.registrationDate || '')))
      .slice(0, PER_KIND)
      .map((d) => ({
        kind: 'deal' as const,
        id: Number(d.id),
        title: String(d.company || '-'),
        sub: [String(d.registrationDate || '').slice(0, 10), STAGE_LABELS[d.status] ?? '', RESULT_LABELS[d.successStatus] ?? '', d.contactName]
          .filter(Boolean)
          .join(' · '),
      }));

    const projectHits: Hit[] = projects
      .map((p) => {
        const company = companyById.get(Number(p.customerId)) || String(dealById.get(Number(p.dealId))?.company || '');
        return { p, company };
      })
      .filter(({ p, company }) => m.text(company, p.projectName))
      .sort((a, b) => String(b.p.workDate || '').localeCompare(String(a.p.workDate || '')))
      .slice(0, PER_KIND)
      .map(({ p, company }) => ({
        kind: 'project' as const,
        id: Number(p.id),
        title: company || String(p.projectName || '-'),
        sub: [p.workDate ? `작업일 ${String(p.workDate).slice(0, 10)}` : '작업일 미정', p.status === 'completed' ? '완료' : '진행중', p.serviceType]
          .filter(Boolean)
          .join(' · '),
      }));

    return [...customerHits, ...dealHits, ...projectHits];
  }, [query, customers, deals, projects]);

  useEffect(() => setActive(0), [query]);

  // 바깥을 누르면 닫는다
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const choose = (hit: Hit) => {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    if (hit.kind === 'customer') onOpenCustomer(hit.id);
    else if (hit.kind === 'deal') onOpenDeal(hit.id);
    else onOpenProject(hit.id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!hits.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(hits[Math.min(active, hits.length - 1)]);
    }
  };

  const showPanel = open && query.trim().length > 0;
  let lastKind: Kind | null = null;

  return (
    <div ref={boxRef} className="relative w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 md:left-3.5 md:h-[18px] md:w-[18px]" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="회사명·담당자·전화번호 검색"
        aria-label="고객·영업 딜·프로젝트 검색"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        aria-autocomplete="list"
        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-[14px] placeholder:text-slate-400 focus:border-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 md:py-2.5 md:pl-11 md:text-[15px]"
      />
      {showPanel && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-slate-200 bg-white py-2 shadow-xl"
        >
          {hits.length === 0 ? (
            <p className="px-4 py-6 text-center text-[16px] text-slate-500">'{query.trim()}'에 맞는 고객·딜·프로젝트가 없어요.</p>
          ) : (
            hits.map((hit, i) => {
              const Icon = KIND_ICON[hit.kind];
              const header = hit.kind !== lastKind ? KIND_LABEL[hit.kind] : null;
              lastKind = hit.kind;
              return (
                <div key={`${hit.kind}:${hit.id}`}>
                  {header && <p className="px-4 pb-1 pt-3 text-[14px] font-semibold text-slate-500 first:pt-1">{header}</p>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(hit)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                  >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-semibold text-slate-900">{hit.title}</span>
                      {hit.sub && <span className="block truncate text-[14px] text-slate-600">{hit.sub}</span>}
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
