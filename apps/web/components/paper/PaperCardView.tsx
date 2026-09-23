import type { PaperDetail } from '@jogan/db'
import Link from 'next/link'
import { toggleSave } from '@/lib/actions/saved'
import { BookmarkIcon, CloseIcon, ExternalLinkIcon, ShieldIcon } from '@/components/icons'
import { sourceUrl } from '@/lib/link'
import { formatAuthors, formatPublishedDate, splitParenthetical } from '@/lib/paper-format'
import { ProgressSegments } from '@/components/brief/ProgressSegments'
import { TrackBadge } from './TrackBadge'

type Props = {
  detail: PaperDetail
  /** 오늘 브리핑 안에서 이 논문의 0-based 위치. 브리핑에 없으면 -1 */
  position: number
  total: number
}

const SECTION_LABEL = 'font-display text-xs font-bold tracking-[1.4px] text-accent'

/**
 * `/paper/[id]` 카드 상세 (폰, docs/DESIGN.md §6).
 * `briefItem`이 없으면(오늘 브리핑에 실리지 않고 저장함 등에서 바로 들어온 경우, 시드의
 * TMR 논문이 그 예다) 큐레이션 요약을 지어내지 않고 원문 초록만 보여준다.
 */
export function PaperCardView({ detail, position, total }: Props) {
  const { paper, assessment, briefItem, saved } = detail
  const caution = assessment?.track === 'notable'
  const href = sourceUrl(paper)

  const authorsLine = formatAuthors(paper.authors)
  const dateLine = formatPublishedDate(paper.publishedAt)

  return (
    <div className="px-5 pb-10 pt-5">
      <div className="flex items-start gap-3">
        <ProgressSegments position={position} total={total} className="flex-1" />
        <Link
          href="/"
          aria-label="닫기"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-paper-raised"
        >
          <CloseIcon className="h-5 w-5" />
        </Link>
      </div>

      <article
        className={`mt-4 rounded-2xl bg-surface p-4 ${caution ? 'border-2 border-caution-line' : 'border border-line'}`}
      >
        {assessment ? <TrackBadge track={assessment.track} /> : null}
        <h1 className="mt-3 font-display text-2xl font-extrabold leading-[1.36] tracking-[-0.6px] text-ink">
          {paper.title}
        </h1>
        <p className="mt-2 text-[11px] leading-[1.55] text-ink-muted">
          {authorsLine} · {dateLine}
        </p>

        {briefItem ? (
          <>
            <section className="mt-5">
              <h2 className={SECTION_LABEL}>왜 중요한가</h2>
              <p className="mt-2 text-sm leading-[1.68] text-ink-body">{briefItem.whyItMatters}</p>
            </section>

            {briefItem.results.length > 0 ? (
              <section className="mt-5">
                <h2 className={SECTION_LABEL}>방법과 결과</h2>
                <dl className="mt-2 flex flex-col gap-2 rounded-xl border border-line bg-paper p-3">
                  {briefItem.results.map((result) => {
                    const { main, paren } = splitParenthetical(result.value)
                    return (
                      <div key={result.label} className="flex items-baseline justify-between gap-3 text-sm">
                        <dt className="shrink-0 text-ink-muted">{result.label}</dt>
                        <dd className="text-right tabular-nums text-ink-body">
                          {main}
                          {paren ? <span className="text-ink-muted"> {paren}</span> : null}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              </section>
            ) : null}

            {briefItem.limitations.length > 0 ? (
              <section className="mt-5">
                <h2 className={SECTION_LABEL}>한계</h2>
                <div className="mt-2 flex flex-col gap-2 text-sm leading-[1.6] text-ink-body">
                  {(['author', 'ai'] as const).map((source) => {
                    const items = briefItem.limitations.filter((l) => l.bySource === source)
                    if (items.length === 0) return null
                    return (
                      <p key={source}>
                        <span className="font-semibold text-ink-dim">
                          {source === 'author' ? '저자 인정' : 'AI 관찰'}
                        </span>{' '}
                        — {items.map((l) => l.text).join(' ')}
                      </p>
                    )
                  })}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <section className="mt-5">
            <h2 className={SECTION_LABEL}>초록</h2>
            <p className="mt-1 text-[11px] text-ink-muted">
              이 논문은 아직 이 브리핑의 큐레이션 요약이 없습니다. 원문 초록입니다.
            </p>
            <p className="mt-2 text-sm leading-[1.68] text-ink-body">{paper.abstract}</p>
          </section>
        )}
      </article>

      <div className="mt-4 flex items-center gap-3">
        <form action={toggleSave.bind(null, paper.id)} className="flex-1">
          <button
            type="submit"
            aria-pressed={saved != null}
            className={`flex h-12 w-full items-center justify-center gap-2 rounded-[10px] border text-sm font-medium ${
              saved ? 'border-verified-line bg-verified-bg text-verified' : 'border-line-strong bg-surface text-ink-dim'
            }`}
          >
            <BookmarkIcon className="h-4 w-4" />
            {saved ? '저장됨' : '저장'}
          </button>
        </form>

        <Link
          href={`/paper/${paper.id}/trust`}
          aria-label="신뢰도 근거 보기"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-ink text-paper"
        >
          <ShieldIcon className="h-5 w-5" />
        </Link>

        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label="원문 열기"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border border-line-strong text-ink-dim"
          >
            <ExternalLinkIcon className="h-5 w-5" />
          </a>
        ) : null}
      </div>
    </div>
  )
}
