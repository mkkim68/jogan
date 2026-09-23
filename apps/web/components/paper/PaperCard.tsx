import type { Assessment, BriefItem, PaperSummary } from '@jogan/core'
import Link from 'next/link'
import { ExternalLinkIcon } from '@/components/icons'
import { sourceUrl } from '@/lib/link'
import { EvidenceChips } from './EvidenceChips'
import { TrackBadge } from './TrackBadge'

type Props = {
  item: BriefItem
  paper: PaperSummary
  assessment: Assessment | null
  layout: 'phone' | 'web'
}

const SOURCE_LABEL: Record<PaperSummary['source'], string> = {
  arxiv: 'arXiv',
  biorxiv: 'bioRxiv',
  medrxiv: 'medRxiv',
  pubmed: 'PubMed',
  openalex: 'OpenAlex',
}

/** 게재처 표시 — venue가 있으면 그 이름, 없으면(대개 프리프린트) 출처를 쓴다 */
function venueLabel(paper: PaperSummary): string {
  return paper.venue?.name ?? SOURCE_LABEL[paper.source]
}

function SourceLink({ paper, className = '' }: { paper: PaperSummary; className?: string }) {
  const href = sourceUrl(paper)
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex min-h-11 items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink ${className}`}
    >
      원문
      <ExternalLinkIcon className="h-3.5 w-3.5" />
    </a>
  )
}

/**
 * 브리핑 카드 (docs/DESIGN.md §6). 폰은 카드 전체가 `/paper/[id]`로 가는 링크,
 * 웹은 좌측 내용 + 우측 132px 액션 칼럼으로 나뉜다.
 * `assessment.track === 'notable'`(심사 전)인 카드는 `caution` 테두리로 시각적으로 구분한다 (CLAUDE.md 절대 규칙 3).
 */
export function PaperCard({ item, paper, assessment, layout }: Props) {
  const caution = assessment?.track === 'notable'
  const borderClass = caution ? 'border-2 border-caution-line' : 'border border-line'
  const detailHref = `/paper/${paper.id}`

  const meta = (
    <div className="flex flex-wrap items-center gap-2">
      {assessment ? <TrackBadge track={assessment.track} /> : null}
      <span className="text-[11px] text-ink-muted">{venueLabel(paper)}</span>
      {item.isSerendipity ? (
        <span className="text-[11px] font-medium text-accent">오늘의 곁가지</span>
      ) : null}
    </div>
  )

  if (layout === 'phone') {
    return (
      <article className={`relative rounded-2xl bg-surface p-4 ${borderClass}`}>
        <Link
          href={detailHref}
          aria-label={paper.title}
          className="absolute inset-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        />
        <div className="relative z-10 flex flex-col gap-2.5">
          {meta}
          <h3 className="font-display text-[19px] font-bold leading-[1.42] tracking-[-0.4px] text-ink">
            {paper.title}
          </h3>
          <p className="text-[12.5px] leading-[1.65] text-ink-soft">{item.oneLine}</p>
          {assessment ? <EvidenceChips evidence={assessment.evidence} max={3} /> : null}
          <SourceLink paper={paper} className="pointer-events-auto self-start" />
        </div>
      </article>
    )
  }

  return (
    <article className={`flex gap-5 rounded-2xl bg-surface p-5 ${borderClass}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {meta}
        <h3 className="font-display text-[21px] font-bold leading-[1.4] tracking-[-0.5px] text-ink">
          <Link href={detailHref} className="hover:underline">
            {paper.title}
          </Link>
        </h3>
        <p className="text-[13px] leading-[1.65] text-ink-soft">{item.oneLine}</p>
        {assessment ? <EvidenceChips evidence={assessment.evidence} max={4} /> : null}
        <SourceLink paper={paper} className="self-start" />
      </div>
      <div className="flex w-[132px] shrink-0 flex-col justify-center gap-2">
        <Link
          href={detailHref}
          className="inline-flex h-11 items-center justify-center rounded-[10px] bg-ink px-3 text-sm font-medium text-paper transition-colors hover:bg-ink-body"
        >
          정독하기
        </Link>
        <button
          type="button"
          disabled
          title="나중에 읽기 저장 — 준비 중"
          className="inline-flex h-11 items-center justify-center rounded-[10px] border border-line-strong px-3 text-sm font-medium text-ink-dim disabled:opacity-50"
        >
          나중에 읽기
        </button>
      </div>
    </article>
  )
}
