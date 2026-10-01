# services/briefer — 선별 · 요약 · 사실 검증 (초안)

> **상태: 초안 — 사용자 결정 대기.** 아래 「결정할 것」 D1~D7에 답을 받기 전에는 구현 계획을 쓰지 않는다.
> 각 항목에 추천안을 적었지만 확정이 아니다. 2026-10-01 사용자 부재 중에 작성했다.

## 왜 지금

CLAUDE.md 작업 순서 5번. collector(관련성)와 evaluator(신뢰도)가 실제 데이터로 돌았고
(`HISTORY.md` 2026-10-01), DB에는 판정된 후보와 평가가 쌓여 있다. 이걸 사용자가 아침에 읽는
**브리핑 한 부**(`briefs` + `brief_items` 4행)로 만드는 단계가 없다. 지금 화면은 시드 데이터만 보여준다.

이 작업이 끝나면 `pnpm pipeline:brief`가 사용자마다 오늘 브리핑을 만들고, 웹 화면이 실제 논문을 보여준다.

## 범위

포함: 후보 선별 → 원문 확보 → 요약 생성 → 사실 검증 → `briefs`/`brief_items` 저장.

제외(로드맵 6·7번): 오디오(TTS), 푸시 알림, 새벽 배치 연결, 프리프린트 후속 추적, 피드백 학습,
"새로움" 감점(이미 본 주제), 공통 관심사 사용자 간 요약 공유.

## 입력 — 무엇을 후보로 보나

사용자마다:

```
paper_candidates (해당 사용자)
  ⋈ relevance_judgments (interest_id, paper_id) where relevant = true   ← ADR 0001 한계 대응
  ⋈ assessments (paper_id)                                              ← 평가 안 된 논문은 제외
  − 이 사용자에게 이미 배달된 논문 (brief_items ⋈ briefs.user_id)
```

통과 판정과 조인하는 이유: ADR 0001 「결과」에 적은 대로, 관련성 판정 도입 이전(2026-09-29) 후보 중
23행은 판정을 받지 않은 채 남아 있다(`HISTORY.md` 2026-10-01). `collected_for` 필터만으로는 그 행이
다시 오늘 후보로 올라오는 경로(upsert의 날짜 갱신)를 막지 못하므로, **통과 판정이 있는 행만** 쓴다.

## 선별 — 4편 고르기

PRD §5: `최종 랭킹 = 관련성 × 신뢰도 × 새로움`. MVP에서는 새로움을 뺀다.

- 관련성: `paper_candidates.relevance` (코사인, 관심사마다 척도가 다르다 — HISTORY 2026-09-29)
- 신뢰도: `assessments`에서 도출 (D2)
- 제약 (CLAUDE.md 절대 규칙 3, PRD §3.4):
  - **심사 전 프리프린트(주목 트랙)는 하루 최대 2편**, 경고 라벨과 함께
  - 관심사 하나가 4자리를 독식하지 않게 관심사별 상한 (D3)
  - 「관심 주제와 유사한 1편」(`isSerendipity`) 슬롯 (D4)

요약·검증에서 떨어진 논문 자리는 **다음 순위로 채운다**(후보가 남아 있는 한). 후보가 모자라면 편수를
줄인다 — 억지로 채우지 않는다(D5).

## 요약

**`services/briefer/src/summarize.ts`** — 논문 하나를 `BriefItem`의 내용 필드로 만든다.

- 입력: 제목, 초록, 본문(arXiv HTML, 없으면 초록만), 그 논문의 `assessments.evidence`·`caveats`
- 출력(zod): `oneLine`, `whyItMatters`, `method`, `results[{label, value}]`,
  `limitations[{bySource: 'author'|'ai', text}]`, `quotes[{text, locator}]`
- 프롬프트: `services/briefer/prompts/summary.md` (CLAUDE.md: 파일로 분리)
- PRD §6 원칙을 프롬프트에 그대로: "그래서 뭐?"를 먼저(`whyItMatters`), 한계는 저자 인정/AI 관찰로 나눈다
- `limitations.bySource = 'ai'`는 evaluator의 caveats·caution 근거에서 가져올 수 있다 — 새로 지어내지 않게
- 모델·`max_tokens`: D6. evaluator의 교훈(`HISTORY.md` 2026-10-01 max_tokens 잘림)대로 상한을 넉넉히 두고,
  파싱 실패는 json/schema로 구분해 원문과 함께 로그로 남긴다(evaluator `82433fa`, collector `onFailure`와 같은 방식)

## 사실 검증 (절대 규칙 1)

요약의 **모든 문장**을 원문(본문, 없으면 초록)과 대조한다. 실패한 문장은 삭제한다.

- 수치: evaluator의 `verifyAgainstSource`를 그대로 쓴다(숫자 토큰 정확 일치)
- **고유명사: 지금 코드에 없다.** 절대 규칙 1은 "모든 숫자·고유명사"를 요구하는데 evaluator의 검증은
  숫자만 본다(`services/evaluator/src/verify.ts` 독스트링에 명시). 방식은 D1.
- `quotes[].text`는 인용이므로 원문에 **그대로** 있어야 한다(공백 정규화 후 부분 문자열 일치)
- 필드별 처리:
  - `oneLine`, `whyItMatters`가 검증 실패 → **그 논문은 배달하지 않는다**(절대 규칙 1 "통과 못 한 논문은 배달하지 않는다")
  - `results`, `limitations`, `quotes`의 항목 → 실패한 항목만 버린다
  - `method` → 문장 단위로 버리고, 다 버려지면 빈 문자열

**공유 코드 위치**: `verify.ts`와 `fulltext.ts`(arXiv HTML)는 evaluator에 있다. briefer도 써야 하므로
`packages/core`로 옮긴다 — HTTP 래퍼를 core로 옮긴 것(`2389df3`)과 같은 이유. evaluator의 import만 바뀐다.

## 저장

- `briefs`: `(user_id, date)` 유니크. `date`는 `todayInSeoul()`, `issueNumber`는 그 사용자의 직전 호수 + 1,
  `readMinutes`는 요약 글자 수로 어림(D7에서 공식 확정)
- `brief_items`: position 0~3, `interestId`는 후보의 관심사, `isSerendipity`는 D4
- 재실행: 같은 날 브리핑이 이미 있으면 D5

## 실패 처리

- 사용자 단위 격리(collector `match`와 같다). 한 사용자의 실패가 다른 사용자를 막지 않는다
- 논문 단위 격리: 요약 호출·파싱·검증 실패는 그 논문만 건너뛰고 다음 순위로
- 전량 실패(LLM 시도 > 0, 성공 0)는 단계 장애로 보고 exit 1 (collector·임베딩과 같은 규칙)

## 결정할 것

| # | 쟁점 | 선택지 | 추천 |
|---|---|---|---|
| D1 | 고유명사 검증 방식 | (a) 요약 LLM에게 문장마다 고유명사 목록을 함께 내게 하고, 그 목록을 원문 문자열 일치로 대조 (b) 대문자/라틴 토큰을 정규식으로 뽑아 원문 대조 (c) 별도 검증 LLM 호출 | **(a)** — 한국어 요약 안의 영문 고유명사(모델명·데이터셋명)를 정규식으로 안정적으로 뽑기 어렵고, (c)는 LLM이 LLM을 검증하는 구조라 "기계적 대조"가 아니다. (a)는 목록 누락 위험이 있으니 (b)를 보조로 겹친다 |
| D2 | 신뢰도 점수 | (a) ③단계 5항목 평균(null 제외) (b) 트랙 가중(verified 1.0 / notable 0.7) × ③ 평균 (c) ③ 없는 논문은 ② 근거만으로 낮은 고정값 | **(b)+(c)** — 지금 실데이터는 전부 notable(색인 안 된 2609.* 프리프린트)이고 ③을 받은 건 하루 6편뿐이라, ③ 없는 논문을 아예 빼면 후보가 6편으로 줄어든다 |
| D3 | 관심사별 상한 | 관심사당 최대 2편 / 1편 / 상한 없음 | **2편** — 관심사 6개에 4편이라 1편 상한이면 순위가 거의 무의미해진다 |
| D4 | 「관심 주제와 유사한 1편」 | MVP에서 생략(`isSerendipity` 항상 false) / 관련성 판정 탈락 중 상위 1편 | **생략** — 정의("인접 분야")를 정하려면 관련성 판정에 3단계(관련/인접/무관)가 필요하다. 판정 데이터가 더 쌓인 뒤에 |
| D5 | 같은 날 재실행 | 덮어쓰기 / 건너뛰기 / 빠진 자리만 채우기 | **건너뛰기** — 사용자가 이미 읽었을 수 있는 지면을 바꾸지 않는다. 강제 재생성은 플래그로 |
| D6 | 요약 모델 | `claude-sonnet-5`(evaluator와 같음) / `claude-opus-5-5` / `claude-haiku-4-5` | **evaluator와 같은 모델로 시작**하고, 실제 요약 몇 부를 사람이 읽어 본 뒤 HISTORY에 기록하고 바꾼다. 하루 4~8회라 비용 차이는 작다 |
| D7 | 읽기 시간 | 한국어 분당 500자 어림 / 고정 1.5분×편수 | **글자 수 ÷ 500, 올림** — 화면 문구("읽기 6분")가 실제 길이를 따라가게 |

## 테스트 (계획 단계에서 구체화)

- 선별: 프리프린트 2편 상한, 관심사 상한, 이미 배달된 논문 제외, 통과 판정 없는 후보 제외, 부족하면 편수 감소
- 요약 파싱: 정상 / 코드블록 / 필드 누락 / 잘림 → 실패 종류별 콜백
- 검증: 숫자 조작 문장 삭제, 고유명사 조작 문장 삭제, 인용 불일치 항목 삭제, oneLine 실패 시 논문 제외 후 다음 순위
- 저장: 호수 증가, 같은 날 재실행 건너뛰기
- 옵트인 실호출 1편, 그리고 실제 실행 후 `HISTORY.md`에 요약 원문 샘플과 검증으로 버려진 문장 수 기록
