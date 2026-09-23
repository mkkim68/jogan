import type { Assessment, Evidence } from '@jogan/core'
import { CheckCircleIcon, WarningTriangleIcon } from '@/components/icons'
import { summarizeTrust } from '@/lib/trust-summary'
import { DisputeButton } from './DisputeButton'

type Props = {
  assessment: Assessment
  title: string
}

const STAGE_ORDER = [1, 2, 3, 4] as const

/** PRD §3.2 4단계 필터의 이름. 숫자만으로는 사용자가 뭘 재는지 알 수 없다. */
const STAGE_LABEL: Record<(typeof STAGE_ORDER)[number], string> = {
  1: '하드 필터',
  2: '출처 신호',
  3: '내용 정밀 평가',
  4: '초기 반응',
}

type StageState = 'pass' | 'caution' | 'none'

/**
 * 요약 카드의 "한 문장 결론". `evidence`/`caveats`에 없는 구체적 수치나 사실은 만들지 않고,
 * 트랙과 유의 여부만으로 정해지는 정형 문구를 쓴다 (CLAUDE.md 절대 규칙 1).
 */
function buildConclusion(assessment: Assessment, caution: boolean): string {
  if (assessment.track === 'notable') {
    return '아직 동료심사를 받지 않은 프리프린트입니다. 근거를 직접 확인한 뒤 판단하세요.'
  }
  if (caution) {
    return '동료심사는 통과했지만, 일부 단계에서 유의할 점이 있습니다.'
  }
  return '평가한 단계에서 우려할 신호가 발견되지 않았습니다.'
}

/**
 * `/paper/[id]/trust` 본문 (docs/DESIGN.md §6, PRD §3.5 투명성 원칙).
 *
 * `evidence`를 stage 1~4로 묶어 카드 4장을 항상 그린다. 어떤 단계에 evidence가 하나도 없으면
 * '통과'로 크레딧하지 않고 `none` 상태("평가 정보 없음")로 표시한다 — task-7이 걸렸던 함정을
 * 반복하지 않는다. `stage3`의 `Score.value` 숫자는 어디에도 쓰지 않고 `evidence[].text` 문장만 쓴다.
 */
export function TrustDetail({ assessment, title }: Props) {
  const trust = summarizeTrust(assessment.evidence)
  // 평가 스키마상 evidence는 최소 1건이라 실제로는 도달하지 않지만, `summarizeTrust`가
  // 근거 없음을 `null`로 표현하게 됐으니(브리핑 수정 참고) 타입 그대로 방어한다.
  if (!trust) {
    return (
      <div className="mt-5 rounded-2xl border border-line bg-surface p-5 text-sm leading-[1.6] text-ink-muted">
        아직 평가 근거가 없습니다.
      </div>
    )
  }
  const conclusion = buildConclusion(assessment, trust.caution)

  const byStage = new Map<number, Evidence[]>()
  for (const item of assessment.evidence) {
    const list = byStage.get(item.stage) ?? []
    list.push(item)
    byStage.set(item.stage, list)
  }

  return (
    <div className="mt-5">
      <p className="line-clamp-2 text-xs leading-relaxed text-ink-muted">{title}</p>

      <section
        className={`mt-3 rounded-2xl border p-5 ${
          trust.caution ? 'border-caution-line bg-caution-bg' : 'border-verified-line bg-verified-bg'
        }`}
      >
        <p className={`text-xs font-semibold ${trust.caution ? 'text-caution' : 'text-verified'}`}>{trust.label}</p>
        <p className="mt-2 font-display text-lg font-bold leading-snug text-ink">{conclusion}</p>
      </section>

      <div className="mt-5 flex flex-col gap-3">
        {STAGE_ORDER.map((stage) => {
          const items = byStage.get(stage) ?? []
          const hasCaution = items.some((item) => item.verdict === 'caution')
          const state: StageState = items.length === 0 ? 'none' : hasCaution ? 'caution' : 'pass'

          return (
            <article
              key={stage}
              className={
                state === 'caution'
                  ? 'rounded-2xl border border-caution-line bg-caution-surface p-4'
                  : state === 'pass'
                    ? 'rounded-2xl border border-line bg-surface p-4'
                    : 'rounded-2xl border border-dashed border-line-strong bg-paper p-4'
              }
            >
              <div className="flex items-center gap-2">
                {state === 'pass' ? <CheckCircleIcon className="h-5 w-5 shrink-0 text-verified" /> : null}
                {state === 'caution' ? <WarningTriangleIcon className="h-5 w-5 shrink-0 text-caution" /> : null}
                <h2 className="text-sm font-semibold text-ink">
                  {stage}단계 · {STAGE_LABEL[stage]}
                </h2>
              </div>

              {items.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {items.map((item, index) => (
                    <li
                      key={index}
                      className={`flex items-start gap-1.5 text-sm leading-[1.6] ${
                        item.verdict === 'caution' ? 'text-caution' : 'text-ink-body'
                      }`}
                    >
                      {item.verdict === 'caution' ? (
                        <WarningTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      ) : null}
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm leading-[1.6] text-ink-muted">이 단계는 아직 평가되지 않았습니다.</p>
              )}
            </article>
          )
        })}
      </div>

      {assessment.caveats.length > 0 ? (
        <section className="mt-6">
          <h2 className="font-display text-xs font-bold tracking-[1.4px] text-accent">유의점</h2>
          <ul className="mt-2 flex flex-col gap-1.5 pl-4 text-sm leading-[1.6] text-ink-body">
            {assessment.caveats.map((caveat, index) => (
              <li key={index} className="list-disc">
                {caveat}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 border-t border-line-hair pt-5">
        <p className="text-xs leading-relaxed text-ink-muted">
          이 판정은 AI 보조 의견입니다. 최종 판단은 읽는 사람의 몫으로 남겨 둡니다.
        </p>
        <DisputeButton className="mt-3" />
      </div>
    </div>
  )
}
