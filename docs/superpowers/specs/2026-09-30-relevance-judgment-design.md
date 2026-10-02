# services/collector — 관련성 판정 단계

## 왜 지금

`docs/adr/0001-relevance-belongs-to-collector.md`의 채택안 A를 구현한다.

evaluator 첫 실제 실행(`HISTORY.md` 2026-09-30)에서, 파이프라인에 관련성을 판정하는 곳이
없다는 것이 드러났다. `수면과 기억 공고화` 후보 17편은 대부분 "기억"이라는 단어만 겹친
LLM 에이전트 메모리 논문인데, 전부 ①단계를 통과했다. evaluator는 신뢰도만 보고, 관심사를
입력으로 받지도 않는다.

이 작업이 끝나면 무관한 논문은 `paper_candidates`에 들어가지 않는다. 관련 논문이 없는 날에는
그 관심사의 후보가 **0편**이 된다. 억지로 채우지 않는 것이 제품 원칙에 맞다.

## 이 설계를 정한 결정들

| 쟁점 | 결정 | 이유 |
|---|---|---|
| 방식 | **LLM 예/아니오 판정** | 매칭은 관심사마다 상위 20편을 순위로 뽑으므로, 임베딩을 개선해도(라벨 풀어쓰기) 20칸은 항상 찬다. "0편"을 만들 수 있는 것은 개별 판정뿐이다 |
| 위치 | **순위 선별(`selectBestPerPaper`) 전, 관심사별 상위 20편에 대해** | 한 논문이 여러 관심사의 상위 20에 걸릴 수 있다. 선별 전에 판정해야 한 관심사에서 탈락한 논문이 다른 관심사로 갈 수 있다 |
| 판정 실패 | **보류** — 후보에 넣지 않고 캐시에도 남기지 않는다 | 판정 없이 통과시키면 필터가 조용히 꺼진다. 14일 창 안에서 다음 실행이 다시 묻는다 |
| 빈 자리 | **채우지 않는다** | 더 깊이 찾아 채우면 결국 덜 관련된 논문으로 20칸을 맞추는 것이다 |
| 캐시 | **(관심사, 논문) 판정을 테이블에 저장** | 매칭은 매일 지난 14일(`COLLECT_WINDOW_DAYS`)을 다시 훑는다. 캐시가 없으면 같은 쌍을 최대 14번 묻는다 |

## 흐름

```
사용자마다:
  관심사마다:
    matchPapersForInterest → 상위 CANDIDATES_PER_INTEREST(20)편, RELEVANCE_FLOOR(0.30) 이상
    각 (관심사, 논문) 쌍:
      캐시(relevance_judgments)에 있으면 → 그 결과
      없으면 judgeRelevance(Haiku) →
        관련 있음  → 통과, 캐시에 저장
        관련 없음  → 탈락, 캐시에 저장
        실패(null) → 보류, 캐시에 저장하지 않음
  탈락 쌍에 해당하는 기존 paper_candidates 행 삭제
  selectBestPerPaper(통과한 것만) → paper_candidates upsert   (기존 그대로)
```

- `selectBestPerPaper`의 동작은 바꾸지 않는다. 입력이 통과한 매치로 줄어들 뿐이다.
- floor 적용은 판정 전에 한다(`selectBestPerPaper`와 같은 기준). floor 아래 쌍에 LLM 호출을 쓰지 않는다.
- **기존 후보 삭제**: `(userId, paperId, interestId)`가 탈락 쌍과 일치하는 `paper_candidates` 행을
  지운다. 9/29에 만들어진 무관한 후보가 다음 실행에서 빠진다. 같은 실행에서 그 논문이 다른
  관심사로 선별되면 이어지는 upsert가 새 행을 넣는다. 삭제는 upsert보다 먼저 한다.
- 이미 만들어진 `assessments`는 논문 단위라 건드리지 않는다.

## 판정

**`services/collector/src/relevance.ts`**

```ts
export type Judgment = { relevant: boolean; reason: string }
export async function judgeRelevance(
  llm: LlmFn,
  interestLabel: string,
  paper: { title: string; abstract: string },
): Promise<Judgment | null>
```

- 순수 함수이고 LLM은 주입받는다. `LlmFn`은 `(prompt, input) => Promise<string>`로 evaluator와 같은 모양이다.
- 응답이 코드블록으로 감싸여 오면 벗겨낸다. zod(`{ relevant: boolean, reason: string.min(1) }`)로
  파싱하고, 실패하면 `null`을 돌려준다.
- 호출 자체가 던지면(API 오류) `null`을 돌려주고, 호출자가 로그를 남긴다.

**프롬프트: `services/collector/prompts/relevance.md`**

- 입력: 관심사 라벨, 논문 제목, 초록
- 기준:
  - 관심사의 **연구 주제 자체**를 다루면 관련 있음
  - 단어만 겹치면 관련 없음(예: 사람의 수면·기억 공고화 vs LLM 에이전트의 메모리 모듈). 방법론만 비슷한 경우도 관련 없음
  - 인접 분야라도 그 관심사를 가진 연구자가 읽을 이유가 분명하면 관련 있음
  - 라벨이 짧으면(예: `stt`) 그 분야의 통상적인 의미로 해석한다
- 출력: `{"relevant": true|false, "reason": "한 문장"}` JSON만

**모델**: `claude-haiku-4-5-20251001`, `max_tokens` 256. 제목과 초록만 넣으니 1회에 약 500토큰이고,
하루 최대 약 120쌍(관심사 6 × 20)에서 캐시 적중을 뺀 만큼 호출한다.

**호출 방식**: `@anthropic-ai/sdk`를 직접 쓰고(evaluator와 같음) SDK의 재시도(`maxRetries: 2`)에
맡긴다. 순차로 호출하고 동시 요청은 두지 않는다.

## 저장

**`packages/db/src/schema/relevance.ts` — 새 테이블 `relevance_judgments`**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `interest_id` | uuid, FK → interests, `on delete cascade` | |
| `paper_id` | uuid, FK → papers, `on delete cascade` | |
| `relevant` | boolean not null | |
| `reason` | text not null | 탈락 사례를 HISTORY에 적을 때 쓰는 관측 자료 |
| `model` | text not null | 판정한 모델 id |
| `judged_at` | timestamptz not null default now() | |

PK는 `(interest_id, paper_id)`. 마이그레이션은 `pnpm db:generate`로 파일을 만들어 커밋한다.

**`packages/db/src/queries/relevance.ts` — 쿼리 3개**

- `listRelevanceJudgments(interestId, paperIds)` → `Map<paperId, boolean>`
- `saveRelevanceJudgments(rows)` — `(interest_id, paper_id)` 충돌 시 갱신
- `deleteCandidatesForPairs(userId, pairs: { interestId, paperId }[])`

## 오케스트레이션

`services/collector/src/index.ts`의 `match()`를 바꾼다. `MatchDeps`에 주입 지점을 더한다.

```ts
judge?: (label: string, paper: { title: string; abstract: string }) => Promise<Judgment | null>
loadJudgments?: (interestId: string, paperIds: string[]) => Promise<Map<string, boolean>>
saveJudgments?: (rows: NewRelevanceJudgment[]) => Promise<void>
deleteCandidates?: (userId: string, pairs: { interestId: string; paperId: string }[]) => Promise<void>
```

- 판정하려면 관심사 라벨과 논문 제목·초록이 필요하다. `listInterests`가 `label`도 돌려주게 하고,
  `matchPapersForInterest`가 `title`, `abstract`도 돌려주게 넓힌다.
- `judge`가 주입되지 않았는데 `ANTHROPIC_API_KEY`가 없으면, **사용자 루프에 들어가기 전에**
  설정 오류로 던진다. 판정 없이 통과시키는 경로는 없다.
- 판정 실패(`null`)는 보류하고 로그를 남긴다(`[collector:relevance] 판정 실패로 보류 <interestId>/<paperId>`).
- 사용자 단위 격리는 기존대로다. 한 사용자의 실패가 다른 사용자를 막지 않는다.
- 실행 로그: 관심사마다 `판정 n · 통과 n · 탈락 n · 보류 n · 캐시 n`, 끝에 LLM 호출 수와 입력·출력 토큰 누계.

## 함께 고치는 것

- `packages/core/src/constants.ts`의 `RELEVANCE_FLOOR` 주석과 `services/collector/src/match.ts`의
  `selectBestPerPaper` 독스트링에 있는 "애매한 것을 걸러내는 일은 evaluator가 맡는다"를
  "관련성 판정 단계(`relevance.ts`)가 맡는다"로 바꾼다. ADR 0001과 모순되기 때문이다.
- `.env.example`, `README.md`에 collector가 `ANTHROPIC_API_KEY`를 쓴다는 것을 적는다.

## 테스트

**단위 (`services/collector`, DB·네트워크 없음)**

- `relevance.test.ts`: 정상 JSON, 코드블록으로 감싼 JSON, 필드 누락 → null, `reason` 빈 문자열 → null,
  llm이 던짐 → null, 입력에 라벨·제목·초록이 모두 들어간다
- `index.test.ts`(match):
  - 탈락한 쌍은 후보가 되지 않는다
  - 한 관심사에서 탈락한 논문이 다른 관심사에서 통과하면 그 관심사로 선별된다
  - 캐시에 있으면 judge를 부르지 않는다
  - 판정 실패는 후보가 아니고 saveJudgments에 들어가지 않는다
  - 탈락 쌍은 deleteCandidates로 넘어간다
  - floor 아래 쌍은 judge를 부르지 않는다
  - judge 없고 키 없으면 던진다

**DB (`packages/db`, 기존 DB 테스트 방식)**

- 새 쿼리 3개. 전용 논문·관심사를 만들어 쓰고 지운다

**옵트인 라이브 (`COLLECTOR_LIVE_TEST=1`, 기존 `live.test.ts`에 추가)**

- 명백히 관련 있는 쌍: `인과추론` × 인과 발견 논문 초록 → `relevant: true`
- 명백히 무관한 쌍: `수면과 기억 공고화` × LLM 에이전트 메모리 논문 초록 → `relevant: false`

**실제 실행과 기록**

`pnpm pipeline:collect` 후 `HISTORY.md`에 기록한다.

- 관심사별 판정·통과·탈락·보류 수. 특히 `수면과 기억 공고화`에 몇 편이 남는가
- 탈락 사유 샘플 3~5개(맞게 뺐는가), 통과했지만 의심스러운 것
- 삭제된 기존 후보 수, LLM 호출 수·토큰·소요 시간

## 범위 밖

- 빈 자리를 더 깊이 찾아 채우기
- 0편 관심사를 화면에 어떻게 보여줄지
- 관심사 라벨 풀어쓰기, 온보딩 변경
- evaluator 변경
