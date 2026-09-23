import type { SVGProps } from 'react'

type IconProps = { className?: string } & Omit<SVGProps<SVGSVGElement>, 'className'>

function Icon({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

/** 검증됨 배지: 원 안에 체크. */
export function CheckCircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
    </Icon>
  )
}

/** 심사 전 배지: 느낌표가 있는 삼각형. */
export function WarningTriangleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4.6 2.9 19.4h18.2L12 4.6Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </Icon>
  )
}

/** 신뢰도 근거 버튼: 방패 안에 체크. */
export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5c2.4 1.3 4.6 1.9 6.5 1.9 0 7.7-2.8 12.1-6.5 13.6-3.7-1.5-6.5-5.9-6.5-13.6 1.9 0 4.1-.6 6.5-1.9Z" />
      <path d="M9.4 12.3 11 13.9l3.6-4" />
    </Icon>
  )
}

/** 저장함: 리본 모양 책갈피. */
export function BookmarkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 3.5h10a1 1 0 0 1 1 1V21l-6-4-6 4V4.5a1 1 0 0 1 1-1Z" />
    </Icon>
  )
}

/** 원문 열기: 사각형에서 뻗어나가는 화살표. */
export function ExternalLinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 6H5.5A1.5 1.5 0 0 0 4 7.5v11A1.5 1.5 0 0 0 5.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" />
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
    </Icon>
  )
}

/** 닫기: X. */
export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </Icon>
  )
}

/** 뒤로가기: 왼쪽 화살표. */
export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 5 8 12l7 7" />
    </Icon>
  )
}

/** 펼치기: 아래쪽 화살표. */
export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 9l7 7 7-7" />
    </Icon>
  )
}

/** 재생: 오른쪽을 향한 삼각형. */
export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.5 4.8v14.4l13-7.2-13-7.2Z" />
    </Icon>
  )
}

/** 일시정지: 세로 막대 두 개. */
export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </Icon>
  )
}

/** 이전 트랙: 왼쪽 삼각형과 세로 막대. */
export function SkipBackIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 5 9 12l10 7V5Z" />
      <path d="M6 5v14" />
    </Icon>
  )
}

/** 다음 트랙: 오른쪽 삼각형과 세로 막대. */
export function SkipForwardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 5l10 7-10 7V5Z" />
      <path d="M18 5v14" />
    </Icon>
  )
}

/** 추가: 더하기 기호. */
export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  )
}

/** 감소: 빼기 기호. 스테퍼의 − 버튼용. */
export function MinusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
    </Icon>
  )
}

/** 검색: 돋보기. */
export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.3-4.3" />
    </Icon>
  )
}

/** 홈(브리핑) 탭: 지붕과 문이 있는 집. */
export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9.5a1 1 0 0 0 1 1h3.5v-6h3v6H17a1 1 0 0 0 1-1V10" />
    </Icon>
  )
}

/** 관심사 탭: 태그(라벨) 모양. */
export function InterestIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M11.5 4H6a2 2 0 0 0-2 2v5.5a2 2 0 0 0 .59 1.41l8 8a2 2 0 0 0 2.82 0l5.5-5.5a2 2 0 0 0 0-2.82l-8-8A2 2 0 0 0 11.5 4Z" />
      <path d="M8.2 8.2h.01" />
    </Icon>
  )
}
