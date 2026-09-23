import type { BriefItem, PaperSummary } from '@jogan/core'
import type { PaperDetail } from '@jogan/db'
import Link from 'next/link'
import { ExternalLinkIcon } from '@/components/icons'
import { sourceUrl } from '@/lib/link'
import { formatAuthors, splitParenthetical } from '@/lib/paper-format'
import { TrackBadge } from './TrackBadge'

type Props = {
  detail: PaperDetail
  /** 같은 브리핑에 실린 다른 논문. 관계는 계산하지 않고 고정 문구로만 안내한다 */
  related: PaperSummary[]
}

const SIDE_LABEL = 'text-[11px] font-semibold tracking-[1px] text-ink-muted'

/**
 * "핵심 3줄" — `oneLine` + `results` 상위 2개를 문장으로 만든다.
 * 없는 문장을 창작하지 않는다 (CLAUDE.md 절대 규칙 1, task-7 brief).
 */
function buildCoreLines(item: BriefItem | null): string[] | null {
  if (!item) return null
  const lines = [item.oneLine]
  for (const result of item.results.slice(0, 2)) {
    lines.push(`${result.label}: ${result.value}`)
  }
  return lines
}

export function PaperReadView({ detail, related }: Props) {
  const { paper, assessment, briefItem } = detail
  const caution = assessment?.track === 'notable'
  const href = sourceUrl(paper)
  const authorsLine = formatAuthors(paper.authors)
  const idLine = paper.arxivId ? `arXiv:${paper.arxivId}` : paper.doi ? `DOI:${paper.doi}` : null
  const coreLines = buildCoreLines(briefItem)

  return (
    <div className="hidden px-7 py-8 tablet:grid tablet:grid-cols-[236px_776px_300px] tablet:gap-7">
      {/* 좌: 함께 읽으면 좋은 논문 — 관계는 계산하지 않고 고정 문구만 쓴다 */}
      <aside className="flex flex-col gap-8">
        {related.length > 0 ? (
          <div>
            <h2 className={SIDE_LABEL}>함께 읽으면 좋은 논문</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {related.map((relatedPaper) => (
                <li key={relatedPaper.id}>
                  <Link
                    href={`/paper/${relatedPaper.id}`}
                    className="block text-sm font-medium leading-snug text-ink hover:underline"
                  >
                    {relatedPaper.title}
                  </Link>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">같은 날 브리핑에 함께 실린 논문</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>

      {/* 중앙: 요약과 원문의 교차 */}
      <main
        className={`min-w-0 rounded-2xl bg-surface p-8 ${caution ? 'border-2 border-caution-line' : 'border border-line'}`}
      >
        {assessment ? <TrackBadge track={assessment.track} /> : null}
        <h1 className="mt-3 max-w-prose font-display text-[33px] font-extrabold leading-[1.32] tracking-[-1px] text-ink">
          {paper.title}
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          {authorsLine}
          {idLine ? ` · ${idLine}` : ''}
        </p>

        {coreLines ? (
          <section className="mt-6 max-w-prose rounded-xl border border-line bg-surface p-4">
            <h2 className={SIDE_LABEL}>핵심 3줄</h2>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-[1.7] text-ink-body">
              {coreLines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ol>
          </section>
        ) : null}

        {briefItem ? (
          <>
            <section className="mt-8 max-w-prose">
              <h2 className="font-display text-xl font-bold tracking-[-0.4px] text-ink">왜 중요한가</h2>
              <p className="mt-3 text-[14.5px] leading-[1.85] text-ink-body">{briefItem.whyItMatters}</p>
            </section>

            {briefItem.method ? (
              <section className="mt-8 max-w-prose">
                <h2 className="font-display text-xl font-bold tracking-[-0.4px] text-ink">방법</h2>
                <p className="mt-3 text-[14.5px] leading-[1.85] text-ink-body">{briefItem.method}</p>
              </section>
            ) : null}

            {briefItem.quotes.length > 0 ? (
              <section className="mt-6 flex max-w-prose flex-col gap-4">
                {briefItem.quotes.map((quote, index) => (
                  <blockquote
                    key={index}
                    className="rounded-r-md border-l-[3px] border-ink bg-paper-raised p-4"
                  >
                    <p className="font-display text-[13.5px] italic leading-[1.7] text-ink-body">
                      &ldquo;{quote.text}&rdquo;
                    </p>
                    <p className="mt-2 text-xs text-ink-muted">
                      원문 {quote.locator} · 클릭하면 PDF의 해당 위치로 이동
                    </p>
                  </blockquote>
                ))}
              </section>
            ) : null}

            {briefItem.results.length > 0 ? (
              <section className="mt-8">
                <table className="w-full border-collapse text-sm">
                  <caption className="mb-2 text-left text-xs font-medium text-ink-muted">
                    {paper.title} — 결과 요약
                  </caption>
                  <thead>
                    <tr className="border-b-[1.5px] border-ink">
                      <th scope="col" className="py-2 pr-4 text-left font-medium text-ink-dim">
                        항목
                      </th>
                      <th scope="col" className="py-2 text-left font-medium text-ink-dim">
                        값
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {briefItem.results.map((result) => {
                      const { main, paren } = splitParenthetical(result.value)
                      return (
                        <tr key={result.label} className="border-b border-line-hair">
                          <td className="py-2 pr-4 font-semibold text-verified">{result.label}</td>
                          <td className="py-2 tabular-nums text-ink-body">
                            {main}
                            {paren ? <span className="text-ink-muted"> {paren}</span> : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>
            ) : null}
          </>
        ) : (
          <section className="mt-8 max-w-prose">
            <h2 className="font-display text-xl font-bold tracking-[-0.4px] text-ink">초록</h2>
            <p className="mt-1 text-xs text-ink-muted">
              이 논문은 아직 이 브리핑의 큐레이션 요약이 없습니다. 원문 초록입니다.
            </p>
            <p className="mt-3 text-[14.5px] leading-[1.85] text-ink-body">{paper.abstract}</p>
          </section>
        )}

        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex h-11 items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
          >
            원문 열기
            <ExternalLinkIcon className="h-4 w-4" />
          </a>
        ) : null}
      </main>

      {/* 우: 도구 — 신뢰도 근거, 내 메모 */}
      <aside className="flex flex-col gap-8">
        {assessment ? (
          <div>
            <h2 className={SIDE_LABEL}>신뢰도 근거</h2>
            <p className="mt-1 text-[11px] text-ink-muted">AI 보조 의견입니다 — 최종 판단은 읽는 사람의 몫입니다.</p>
            <ul className="mt-3 flex flex-col gap-2">
              {assessment.evidence.slice(0, 4).map((evidence, index) => (
                <li
                  key={index}
                  className={`text-xs leading-relaxed ${evidence.verdict === 'caution' ? 'text-caution' : 'text-ink-body'}`}
                >
                  {evidence.text}
                </li>
              ))}
            </ul>
            <Link
              href={`/paper/${paper.id}/trust`}
              className="mt-3 inline-flex h-11 items-center text-sm font-medium text-verified hover:text-verified-hover"
            >
              판정 근거 전체 보기
            </Link>
          </div>
        ) : null}

        <div>
          <label htmlFor="paper-memo" className={SIDE_LABEL}>
            내 메모
          </label>
          <textarea
            id="paper-memo"
            rows={4}
            disabled
            placeholder="선택한 문장에 바로 붙습니다 — 준비 중"
            className="mt-2 w-full resize-none rounded-[10px] border border-line-strong bg-paper-subtle p-3 text-sm text-ink-muted placeholder:text-ink-muted disabled:opacity-70"
          />
          <button
            type="button"
            disabled
            title="메모 저장 — 준비 중"
            className="mt-2 inline-flex h-11 items-center justify-center rounded-[10px] border border-line-strong px-4 text-sm font-medium text-ink-muted disabled:opacity-50"
          >
            저장
          </button>
        </div>
      </aside>
    </div>
  )
}
