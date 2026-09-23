'use client'

import type { FollowUp, Track } from '@jogan/core'
import Link from 'next/link'
import { useState } from 'react'
import { FollowUpNote } from '@/components/brief/FollowUpNote'
import { CheckCircleIcon, ExternalLinkIcon } from '@/components/icons'
import { TrackBadge } from '@/components/paper/TrackBadge'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { markPaperRead } from '@/lib/actions/saved'

export type SavedRow = {
  paperId: string
  title: string
  savedLabel: string
  isRead: boolean
  track: Track | null
  sourceHref: string | null
  followUp: FollowUp | null
}

type Segment = 'unread' | 'read'

/**
 * `/saved` 목록 (docs/DESIGN.md §6). 세그먼트 `읽을 것 N` / `읽음 M`은 `readAt` 유무로 나눈다.
 *
 * 서버(page.tsx)가 `listSaved`를 한 번만 호출해 `rows`를 통째로 넘기고, 세그먼트 전환은
 * 여기서 클라이언트 상태로만 필터링한다 — 탭을 바꿔도 추가 네트워크 왕복이 없다.
 */
export function SavedList({ rows }: { rows: SavedRow[] }) {
  const [segment, setSegment] = useState<Segment>('unread')

  const unread = rows.filter((row) => !row.isRead)
  const read = rows.filter((row) => row.isRead)
  const shown = segment === 'unread' ? unread : read

  return (
    <div>
      <SegmentedControl
        aria-label="저장 상태"
        value={segment}
        onChange={(value) => setSegment(value as Segment)}
        options={[
          { value: 'unread', label: `읽을 것 ${unread.length}` },
          { value: 'read', label: `읽음 ${read.length}` },
        ]}
        className="mt-4"
      />
      <p className="mt-3 text-[11px] text-ink-muted">신뢰도 배지와 근거는 AI 보조 의견입니다</p>

      {shown.length === 0 ? (
        <p className="mt-6 text-sm text-ink-muted">
          {segment === 'unread' ? '아직 읽지 않은 저장 논문이 없습니다.' : '읽음으로 표시한 논문이 아직 없습니다.'}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {shown.map((row) => (
            <li
              key={row.paperId}
              className={`rounded-2xl bg-surface p-4 ${
                row.track === 'notable' ? 'border-2 border-caution-line' : 'border border-line'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {row.track ? <TrackBadge track={row.track} /> : null}
                <span className="text-[11px] text-ink-muted">{row.savedLabel}</span>
              </div>

              <Link
                href={`/paper/${row.paperId}`}
                className="mt-2 block font-display text-[16.5px] font-bold leading-snug text-ink hover:underline"
              >
                {row.title}
              </Link>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Link
                  href={`/paper/${row.paperId}`}
                  className="inline-flex h-11 items-center rounded-[10px] border border-line-strong px-3 text-sm font-medium text-ink-dim hover:bg-paper-raised"
                >
                  요약 다시 보기
                </Link>

                {row.sourceHref ? (
                  <a
                    href={row.sourceHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"
                  >
                    원문
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                  </a>
                ) : null}

                {row.isRead ? (
                  <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-verified">
                    <CheckCircleIcon className="h-4 w-4" />
                    읽음
                  </span>
                ) : (
                  <form action={markPaperRead.bind(null, row.paperId)} className="ml-auto">
                    <button
                      type="submit"
                      aria-label="읽음으로 표시"
                      title="읽음으로 표시"
                      className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:bg-paper-raised hover:text-verified"
                    >
                      <CheckCircleIcon className="h-5 w-5" />
                    </button>
                  </form>
                )}
              </div>

              {row.followUp ? <FollowUpNote followUp={row.followUp} className="mt-3" /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
