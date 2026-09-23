import Link from 'next/link'
import { PlayIcon } from '@/components/icons'

type Props = {
  /** 오디오 브리핑 총 길이(초). 아직 생성 전이면 null — 없는 길이를 지어내지 않는다 */
  seconds: number | null
  className?: string
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds > 0 ? `${minutes}분 ${seconds}초` : `${minutes}분`
}

/**
 * 오디오 스트립 (docs/DESIGN.md §6 폰 `/`). `ink` 배경 다크 바 + 원형 재생 버튼 38px.
 * 탭하면 `/audio`로 이동. 길이가 없으면(오디오 미생성) 이동 없이 준비 중 상태만 보여준다.
 */
export function AudioStrip({ seconds, className = '' }: Props) {
  if (seconds == null) {
    return (
      <div
        className={`flex min-h-[52px] items-center gap-3 rounded-2xl bg-ink px-4 py-3 ${className}`}
      >
        <span
          aria-hidden="true"
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-night-track text-night-dim"
        >
          <PlayIcon className="h-4 w-4" />
        </span>
        <p className="text-[13px] text-night-dim">오디오 브리핑은 아직 준비되지 않았습니다.</p>
      </div>
    )
  }

  return (
    <Link
      href="/audio"
      className={`flex min-h-[52px] items-center gap-3 rounded-2xl bg-ink px-4 py-3 transition-opacity hover:opacity-90 ${className}`}
    >
      <span
        aria-hidden="true"
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-night-track text-night-text"
      >
        <PlayIcon className="h-4 w-4" />
      </span>
      <p className="text-[13px] text-night-soft">
        <span className="tabular-nums text-night-text">{formatDuration(seconds)}</span> · 새벽에 미리 받아뒀습니다
      </p>
    </Link>
  )
}
