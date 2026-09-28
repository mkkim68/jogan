# `services/collector` 설계 — arXiv 수집 · 중복 제거 · 임베딩 · 관련성

2026-09-27. `CLAUDE.md` 작업 순서 3번. `docs/PRD.md` §5 파이프라인의 **앞 세 박스**(수집 → 중복 제거 → 관련성 필터)를 구현한다. 하드 필터·메타데이터 점수는 evaluator, 요약은 briefer 몫이다.

지금까지 화면에 보이는 것은 전부 가상 시드다. 이 작업이 끝나면 **진짜 논문이 DB에 들어오고, 사용자별 후보까지 좁혀진다.**

## 목표

```bash
pnpm pipeline:collect
```
한 번으로 arXiv에서 어제(첫 실행은 7일)치 논문을 가져와 중복을 제거하고, 임베딩을 채우고, 사용자별 후보를 `paper_candidates`에 남긴다. 중간에 죽어도 다시 실행하면 이어서 진행한다.

## 결정 사항

| 항목 | 결정 | 이유 |
|---|---|---|
| 슬라이스 범위 | 수집 + 중복 제거 + 임베딩 + 관련성 필터 | 관련성까지 해야 결과를 눈으로 판단할 수 있고, `interests.embedding`을 채우는 주체가 생긴다 |
| 임베딩 모델 | **Voyage `voyage-3`** (1024차원) | 기존 `EMBEDDING_DIM = 1024`와 정확히 일치해 마이그레이션이 없다. Anthropic이 권장하는 조합 |
| Voyage 호출 | 공식 SDK 대신 **`fetch` + 자체 래퍼** | CLAUDE.md는 외부 호출이 레이트리밋·재시도 래퍼를 통과할 것을 요구한다. SDK의 재시도 동작을 우리가 통제할 수 없다 |
| 수집 범위 | **고정 카테고리 목록** | 관심사는 자연어라 카테고리와 1:1이 아니다. 고정 목록이 볼륨과 비용을 예측 가능하게 한다 |
| 카테고리 | `cs.AI` `cs.CL` `cs.LG` `cs.SE` `cs.SD` `q-bio.NC` `stat.ME` | 현재 관심사(LLM 에이전트·수면과 기억·코드 리뷰·인과추론·음성)를 덮는다. 상수라 조정이 쉽다 |
| 초기 적재 | 최근 **7일** | 필터가 제대로 도는지 판단할 표본은 되면서 첫 실행이 오래 걸리지 않는다 |
| 후보 저장 | **`paper_candidates` 테이블 추가** | PRD §5 "각 단계는 결과를 DB에 남긴다". 단계 독립성과 재시도가 여기에 달려 있다 |
| 워터마크 | **`pipeline_state` 테이블** (key-value) | `max(papers.created_at)`에서 유추하면 부분 실패 후 구멍이 생긴다. evaluator·briefer도 재사용한다 |
| XML 파싱 | `fast-xml-parser` | arXiv는 Atom XML만 준다. 파싱 결과는 다시 zod로 검증한다 |

## 흐름

```
① fetch    arXiv Atom API
           고정 카테고리 × [워터마크, now], submittedDate 오름차순 페이지네이션
           요청 간 3초 (arXiv 정책)
             ↓ ArxivEntry[]
② dedupe   버전 정규화(2609.00001v2 → 2609.00001), 배치 내 최신 버전만
           → papers upsert (arxiv_id 충돌 시 갱신)
             ↓
③ embed    papers.embedding IS NULL  → Voyage(input_type: document)
           interests.embedding IS NULL → Voyage(input_type: query)
           128건 배치
             ↓
④ match    사용자 × 관심사 × 최근 논문 코사인 유사도
           임계값 이상 & 관심사당 상위 N편
           → paper_candidates upsert
```

네 단계는 `index.ts`가 순서대로 부르지만, 각각 독립 함수이고 자기 앞 단계의 결과를 DB에서 읽는다. ③이 죽어도 ①②의 결과는 남고, 다시 실행하면 임베딩이 비어 있는 행부터 이어서 한다.

## 스키마 추가 (마이그레이션 `0002`)

### `paper_candidates`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `user_id` | text FK → users, cascade | |
| `paper_id` | uuid FK → papers | |
| `interest_id` | uuid FK → interests, **set null** | 어느 관심사로 걸렸는지. 관심사가 지워져도 후보는 남는다 |
| `relevance` | real | 코사인 유사도 0~1 |
| `collected_for` | date | KST 기준 수집일 |
| `created_at` | timestamptz default now() | |

PK `(user_id, paper_id)` — 한 논문이 여러 관심사에 걸리면 **행은 하나만** 남긴다. upsert 시 새 `relevance`가 기존보다 높을 때만 `relevance`·`interest_id`·`collected_for`를 **함께** 갱신한다(어느 관심사로 걸렸는지가 점수와 어긋나면 안 된다). 인덱스 `(user_id, collected_for)`.

> 다음 단계(briefer)에 주의: `collected_for`는 "그 논문이 처음 후보가 된 날"이지 "오늘 다시 걸린 날"이 아니다. relevance는 고정된 두 임베딩의 코사인이라 재실행해도 같은 값이 나오고, 갱신 조건이 strict `>`라서 한 번 쓰인 행의 `collected_for`는 사실상 고정된다. 따라서 오늘 브리핑 후보를 `collected_for = 오늘`로 조회하면 어제 후보가 됐지만 아직 쓰이지 않은 논문을 놓친다. 후보 풀은 날짜가 아니라 **소비 여부**로 걸러야 한다.
>
> 같은 소비 마커가 ④의 대상 선정도 고쳐야 한다. 지금 ④는 `published_at >= now - COLLECT_WINDOW_DAYS`로 고르는데, 임베딩이 창보다 오래 막히면(Voyage 장애) 밀린 논문들이 임베딩될 즈음 이미 창 밖이라 영영 후보가 되지 못한다. 당장은 `COLLECT_WINDOW_DAYS`(14일)를 `COLLECT_BACKFILL_DAYS`(7일)보다 넓게 둬 시간을 벌어두었을 뿐이다. 올바른 조건은 **"임베딩이 있고 아직 `paper_candidates`에 없음"** 이며, briefer의 소비 마커를 설계할 때 ④의 조건도 함께 바꾼다.

### `pipeline_state`

| 컬럼 | 타입 |
|---|---|
| `key` | text PK |
| `value` | text |
| `updated_at` | timestamptz default now() |

collector가 쓰는 키: `collector:arxiv:last_submitted_at` (ISO 8601).

## ① fetch — arXiv

- 엔드포인트 `http://export.arxiv.org/api/query`
- 질의: `(cat:cs.AI OR cat:cs.CL OR …) AND submittedDate:[<워터마크> TO <now>]`, `sortBy=submittedDate&sortOrder=ascending`
  - **오름차순이어야 한다.** 내림차순이면 페이지 0이 가장 최신이라, 아래 워터마크 정의("저장한 논문 중 가장 늦은 `published_at`")와 조기 종료(상한 도달·빈 페이지)가 서로 모순된다 — 아직 받지 않은 더 오래된 구간을 워터마크가 통째로 뛰어넘는다. 오름차순이면 저장분이 항상 창의 오래된 쪽부터 이어지는 연속 구간이라 정의가 구조적으로 성립한다
- 페이지 크기 200, `start`로 페이지네이션. **요청 간 3초** — arXiv가 명시한 정책이다
- 안전장치: 한 실행에서 최대 3000편. 초과하면 로그를 남기고 멈춘다(워터마크는 그만큼만 전진)
- 첫 실행(워터마크 없음)은 `now - 7일`

**워터마크 값은 "이번 실행에서 저장한 논문 중 가장 늦은 `published_at`"** 이다. `now`를 쓰면 arXiv가 늦게 색인한 논문을 영영 놓친다.

다음 실행은 `워터마크 - 3일`부터 조회한다 — 경계에서 새는 것을 막는 겹침이고, upsert라 중복 비용이 없다. 3일인 이유는 arXiv의 색인 지연이 실측 2.5일이기 때문이다(2026-09-28 05:04 UTC 실행에서 가장 늦은 제출 시각이 2026-09-25 17:59:52 UTC). 모더레이션에 걸린 논문은 원래 `submittedDate`를 달고 늦게 공개되므로, 겹침이 지연보다 짧으면 영영 못 받는다.

**워터마크는 ①②가 모두 끝난 뒤에만** 갱신한다. 중간에 죽으면 다음 실행이 같은 구간을 다시 가져오지만, 역시 upsert라 무해하다.

### Atom 엔트리 → `Paper`

| `Paper` | 출처 | 비고 |
|---|---|---|
| `arxivId` | `<id>`에서 URL과 `vN` 제거 | `2609.00001` |
| `doi` | `<arxiv:doi>` | 없으면 null |
| `title` | `<title>` | 줄바꿈·연속 공백 정규화 |
| `abstract` | `<summary>` | 같음 |
| `authors` | `<author><name>`, `<arxiv:affiliation>` | affiliation은 선택 |
| `publishedAt` | `<published>` | |
| `source` | `'arxiv'` | |
| `venue` | `{ name: 'arXiv', kind: 'preprint' }` | |
| `pdfUrl` | `http://arxiv.org/pdf/<arxivId>` | |
| `codeUrl` | `null` | arXiv 메타데이터에 없다. 초록에서 GitHub 링크를 긁는 것은 하지 않는다 |
| `openAccess` | `true` | |
| `embedding` | `null` | ③에서 채운다 |
| `mergedInto` | `null` | |

**파싱 실패는 그 엔트리만 건너뛰고 로그**한다. 한 편 때문에 실행 전체가 죽지 않는다 (CLAUDE.md 코딩 규칙).

## ② 중복 제거

- **버전**: `2609.00001v1`과 `v2`는 같은 논문이다. 배치 안에서는 최신 버전만 남기고, DB에는 `arxiv_id` 충돌 시 `title`·`abstract`·`published_at`·`doi`를 **갱신**한다.
- **초록이 바뀌면 임베딩을 무효화**한다 — 갱신 시 `embedding = NULL`로 되돌려 ③이 다시 계산하게 한다. 이걸 빠뜨리면 낡은 벡터로 매칭하게 된다.
- **DOI 충돌**: `papers.doi`는 unique다. 다른 행이 이미 그 DOI를 갖고 있으면 그 논문만 건너뛰고 로그한다. 출처가 arXiv 하나뿐인 지금은 거의 일어나지 않고, 프리프린트↔출판본 병합(`mergedInto`)은 두 번째 출처가 들어올 때 제대로 다룬다.
- 제목 정규화 기반 병합은 **하지 않는다** — 오탐이 잦고, 지금은 arXiv id로 충분하다.

## ③ 임베딩 — Voyage

- `POST https://api.voyageai.com/v1/embeddings`, `model: 'voyage-3'`, 배치 최대 128
- 논문: `"{title}\n\n{abstract}"`, 8000자에서 자른다. `input_type: 'document'`
- 관심사: `label`. `input_type: 'query'`
- 응답 차원이 `EMBEDDING_DIM`과 다르면 **즉시 실패**한다 — 조용히 저장하면 pgvector가 나중에 터진다
- 배치 실패는 그 배치만 건너뛰고 로그. 임베딩이 null로 남아 다음 실행에서 재시도된다

`interests.embedding`이 지금 전부 null인데 채우는 주체가 없었다. 이 단계가 그 주체다.

## ④ 관련성 매칭

각 사용자에 대해, 임베딩이 있는 각 관심사마다:

- 대상: `published_at`이 최근 `COLLECT_WINDOW_DAYS`(14일) 이내이고 `embedding IS NOT NULL`인 논문 — 백필 창(7일)보다 반드시 넓어야 한다
- `cosineDistance`(drizzle 0.45 내장)로 정렬, 유사도 = `1 - distance`
- `relevance >= RELEVANCE_THRESHOLD` 이고 관심사당 상위 `CANDIDATES_PER_INTEREST`편
- `paper_candidates`에 upsert. 이미 있으면 **더 높은 relevance로만** 갱신

**임계값은 추측이다.** `RELEVANCE_THRESHOLD = 0.45`로 시작하되 상수에 "실제 결과를 보고 조정할 값"이라고 적는다. 상위 N편 제한이 함께 있어서, 임계값이 잘못돼도 후보 수가 폭발하지 않는다.

임베딩이 없는 관심사는 **건너뛰고 로그**한다 — 실패가 아니라 "아직 준비 안 됨"이다.

## 상수 (`packages/core`)

```
ARXIV_CATEGORIES        7개 카테고리
COLLECT_BACKFILL_DAYS   7   첫 실행 적재 기간
COLLECT_WINDOW_DAYS     14  매칭 대상 논문의 최근성 (백필 창보다 넓게)
COLLECT_MAX_PER_RUN     3000
RELEVANCE_THRESHOLD     0.45  ← 실제 결과를 보고 조정
CANDIDATES_PER_INTEREST 50
VOYAGE_MODEL            'voyage-3'
VOYAGE_BATCH_SIZE       128
```

`PaperCandidate` zod 스키마도 core에 둔다. 다른 도메인 타입과 같은 규칙을 따른다.

## 외부 호출 래퍼

`services/collector/src/http.ts` — 최소 요청 간격과 지수 백오프 재시도를 갖는 래퍼. arXiv(3초 간격)와 Voyage(간격 없음, 429/5xx 재시도)가 같은 래퍼를 통과한다. 응답 본문은 호출부에서 zod로 검증한다.

evaluator가 OpenAlex·Semantic Scholar를 붙일 때 공유 패키지로 뺀다. **지금 미리 빼지 않는다** — 소비자가 하나뿐이다.

## 파일

```
services/collector/src/
├── index.ts          네 단계 오케스트레이션, 단계별 로그·건수
├── http.ts           레이트리밋 + 재시도 래퍼
├── arxiv.ts          질의 조립, Atom 파싱, 엔트리 → Paper (순수 부분 분리)
├── arxiv.test.ts     실제 응답 픽스처로 파싱·매핑·버전 정규화
├── embed.ts          Voyage 클라이언트, 배치
├── match.ts          유사도 선별 (순수 함수 + DB 쿼리 분리)
├── match.test.ts     임계값·상위 N·중복 관심사 처리
└── fixtures/arxiv-response.xml
packages/core/src/
├── constants.ts      위 상수 추가
└── candidate.ts      PaperCandidate
packages/db/src/
├── schema/candidates.ts, pipeline-state.ts
├── queries/candidates.ts, pipeline-state.ts, papers.ts(upsert·미임베딩 조회 추가)
└── migrations/0002_*.sql
```

## 테스트

- **순수 단위** — Atom 파싱과 필드 매핑(픽스처), `vN` 제거, 배치 내 버전 중복, 유사도 선별(임계값·상위 N·한 논문이 두 관심사에 걸릴 때 더 높은 쪽)
- **DB 통합** — `paper_candidates` upsert가 더 높은 relevance로만 갱신하는지, 워터마크 읽기/쓰기, 초록 갱신 시 `embedding`이 null로 돌아가는지. 기존 `queries.test.ts` 패턴(`try/finally` 정리)을 따른다
- **실호출** — arXiv 5편, Voyage 2건짜리 통합 테스트 하나. `COLLECTOR_LIVE_TEST=1`일 때만 돈다. 기본 `pnpm test`에서는 skip

## 환경변수

```
VOYAGE_API_KEY=      # https://voyageai.com 에서 발급
```
`.env.example`과 README에 추가한다. 없으면 ①②까지 돌고 ③에서 명확한 메시지와 함께 멈춘다 — 조용히 건너뛰지 않는다.

## 비용

고정 카테고리 기준 하루 수백~1500편. 논문 한 편당 대략 400토큰(제목+초록)이면 하루 최대 60만 토큰, voyage-3 기준 하루 몇 센트 수준이다. 실행마다 처리 건수와 추정 토큰을 로그로 남긴다.

## 완료 기준

```bash
pnpm db:migrate
pnpm pipeline:collect     # 첫 실행: 7일치
```
→ `papers`에 실제 arXiv 논문이 쌓이고, 전부 `embedding`이 차 있고, `paper_candidates`에 시드 사용자의 후보가 생긴다. 한 번 더 실행하면 새 논문만 추가되고 중복이 생기지 않는다. `pnpm typecheck` · `pnpm test` · `pnpm build` 통과.

## 범위 밖

- 다른 출처(bioRxiv·medRxiv·PubMed·OpenAlex·Crossref·Semantic Scholar)
- 하드 필터(철회·약탈적 학술지·페이퍼밀)와 메타데이터 점수 — evaluator
- 프리프린트↔출판본 병합(`mergedInto`)의 본격 구현 — 두 번째 출처와 함께
- pgvector HNSW 인덱스 — 행이 몇 천 개인 동안은 순차 스캔으로 충분하다. 수만 건을 넘기면 그때 마이그레이션 하나로 붙인다
- 새벽 배치 연결(Vercel Cron) — 작업 순서 6번
- 서버리스 커넥션 풀 조정(`client.ts`의 `max`) — 배포 시점 과제. collector는 단일 프로세스 스크립트라 영향받지 않는다

---

## 이 단계에서 남긴 후속 과제

수집기 구현과 세 차례 리뷰에서 나왔지만, 다음 단계(evaluator·briefer)와 함께 결정해야 해서
미룬 것들이다.

- **후보 풀은 날짜가 아니라 소비 여부로 걸러야 한다.** 지금 ④단계는 `published_at`이 최근
  `COLLECT_WINDOW_DAYS`(14일) 안인 논문을 대상으로 한다. 올바른 조건은 "임베딩이 있고 아직
  `paper_candidates`에 없음"인데, 여기엔 briefer 쪽 소비 마커(`consumed_at` 컬럼이나
  `brief_items` 조인)가 필요하다. 그때 함께 바꾼다.
- **`match()`는 `user_settings.include_preprints`를 보지 않는다.** arXiv 수집분은 전부
  프리프린트라, 이 설정을 끈 사용자는 후보를 받되 전부 버려야 한다. 어디서 거를지 —
  후보 생성 시점인지 브리핑 선정 시점인지 — 를 evaluator 설계에서 정한다.
- **사용자당 후보 상한이 없다.** `CANDIDATES_PER_INTEREST`(50)는 관심사당이므로 관심사 6개면
  최대 300편이다. CLAUDE.md의 "사용자당 하루 10~50편"은 LLM 본문 평가 기준이니, 300 → 50을
  어느 단계가 책임질지 정해야 한다.
- **수집한 논문의 97%에 DOI가 없다.** arXiv는 저널 게재 전까지 DOI를 주지 않는다. 카드의
  "원문 링크(DOI 우선)"는 대부분 arXiv 링크로 떨어지는데, 저장된 `pdf_url` 대신
  `https://arxiv.org/abs/<arxiv_id>`(초록 페이지)를 쓰는 편이 낫다. `arxiv_id`에서 유도
  가능하므로 스키마 변경은 필요 없다.
- **시드 논문 5편은 가짜 임베딩을 단 채 매칭 대상 풀에 섞여 있다.** 1024차원 난수와 실제
  임베딩의 코사인은 0 근처라 임계값을 넘지 못하지만, 진짜 데이터와 구분할 컬럼이 없다.
  실데이터로 평가를 돌릴 땐 명시적으로 걸러야 한다.
- **`RELEVANCE_THRESHOLD = 0.45`는 아직 한 번도 실제 결과로 검증되지 않았다.** `VOYAGE_API_KEY`가
  생긴 뒤 첫 실행의 상위 후보를 보고 정해야 한다. 그 전까지 이 값 위에 다른 기준을 쌓지 않는다.
