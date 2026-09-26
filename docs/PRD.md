# 조간 논문 — 기획

## 1. 한 줄 정의

매일 아침 출근 시간에 맞춰, 내 관심사 분야에서 **믿을 만하고 읽을 가치가 있는 논문 3~5편**만 골라 요약해 배달하는 연구 비서.

요약은 흔하다. 하루 수천 편에서 "이건 봐도 된다"를 골라주는 일이 이 제품의 차별점이다.

---

## 2. 사용 상황

주 사용 맥락은 **출근길 대중교통**이다. 설계 제약이 여기서 나온다.

- 서서, 한 손으로, 사람 많은 칸에서 본다 → 긴 텍스트와 PDF는 못 읽는다
- 환승·하차로 자주 끊긴다 → 한 단위가 1~2분 안에 끝나야 한다
- 터널에서 연결이 끊긴다 → 새벽에 미리 받아둬야 한다

그래서 **폰은 발견, 웹은 정독**으로 역할을 나눈다. 폰에서 훑고 저장한 논문을 사무실 웹에서 원문과 함께 파고든다.

---

## 3. 핵심 — 신뢰도 필터

### 3.1 근본 딜레마

**"최신"과 "검증됨"은 충돌한다.** 오늘 나온 논문에는 인용 수도, 동료심사도 없다. 인용 수로 거르면 최신성이 사라지고, 최신성만 보면 쓰레기가 섞인다.

해결책은 단일 점수가 아니라 **다층 필터 + 두 트랙 배달**이다.

### 3.2 4단계 필터

비싼 검사일수록 뒤에 둔다. 앞 단계에서 후보를 줄여야 비용이 감당된다.

**① 하드 필터 — 무조건 제외 (규칙 기반, 비용 0)**

| 검사 | 데이터 소스 |
|---|---|
| 철회된 논문 | Retraction Watch DB, Crossref 철회 메타데이터 |
| 약탈적 학술지 · 하이재킹 저널 | 공개 블랙리스트, DOAJ/Scopus 등재 여부 대조 |
| 페이퍼밀 의심 신호 | 비정상적 투고-게재 간격, tortured phrases 패턴, 동일 템플릿 반복 |
| 메타데이터 부실 | 초록만 존재하고 본문 접근 불가, DOI 없음 |

**② 출처 신호 — 어디서 나왔나 (메타데이터, 저렴)**

| 신호 | 판단 기준 | 비고 |
|---|---|---|
| 게재처 등급 | CS는 CORE A*/A, 일반 저널은 SJR Q1 | 분야별로 기준이 다르다 |
| 심사 상태 | 채택 > OpenReview 심사 중 > 프리프린트 | OpenReview 리뷰 점수 활용 |
| 저자 이력 | OpenAlex·Semantic Scholar의 과거 논문·인용 | **가중치를 낮게 둔다** (명성 편향) |

**③ 내용 정밀 평가 — 논문이 탄탄한가 (LLM, 상위 후보 30~50편만)**

본문을 읽고 체크리스트로 채점한다. 항목별 근거 문장을 반드시 함께 남긴다 (그게 UI에 노출되는 "신뢰도 근거"다).

- **재현성** — 코드·데이터가 공개되었는가, 저장소가 실제로 존재하는가
- **실험 설계** — 표본 크기, 대조군/베이스라인의 적절성, ablation 유무
- **통계** — 신뢰구간·효과크기 보고 여부, p-hacking 의심 신호
- **주장 대 증거** — 초록의 주장이 실제 결과 범위를 넘지 않는가
- **한계 인정** — limitations 섹션이 성실한가
- **의학·생명 추가** — 사전등록 여부(ClinicalTrials.gov), 연구 설계 등급(RCT > 코호트 > 관찰 > 사례보고)

**④ 초기 반응 — 전문가들이 주목하는가 (보조 지표)**

- Semantic Scholar의 influential citations
- GitHub 스타 증가 속도, HuggingFace Papers 추천
- 해당 분야 인증 연구자들의 언급

### 3.3 분야별 가중치

하나의 공식을 모든 분야에 쓰면 안 된다.

| 분야 | 조정 |
|---|---|
| AI · CS | 프리프린트 문화가 강함 → ③내용, ④초기 반응 비중↑ |
| 의학 · 생명과학 | 오정보 위험이 큼 → ②심사 여부, 연구 설계 등급 비중↑, 프리프린트에 강한 경고 |
| 사회과학 | 재현성 위기 → 사전등록, 표본 크기 중시 |

### 3.4 두 트랙 배달

- 🟢 **검증 트랙** — 동료심사 통과 + 고득점
- 🟡 **주목 트랙** — 심사 전이지만 내용 점수가 높음. 경고 라벨 필수, **하루 1~2편으로 제한**
- 🔁 **재평가** — 배달한 프리프린트를 2~4주 뒤 다시 확인해 `채택됨` / `반박 논문 등장` 같은 후속 소식을 알린다. **이 기능이 경쟁 서비스와의 가장 큰 차별점이다.**

### 3.5 투명성 원칙

점수만 보여주지 않는다. **왜 믿을 만한지 근거를 문장으로** 보여준다. 사용자가 AI 판단을 맹신하지 않고 스스로 판단할 수 있게 하는 것이 목적이다. 판정에 이의를 제기하는 경로도 UI에 둔다.

---

## 4. 데이터 모델

```ts
type Paper = {
  id: string
  doi: string | null
  arxivId: string | null
  title: string
  authors: { name: string; affiliation?: string }[]
  abstract: string
  publishedAt: Date
  source: 'arxiv' | 'biorxiv' | 'medrxiv' | 'pubmed' | 'openalex'
  venue: { name: string; kind: 'conference' | 'journal' | 'preprint' } | null
  pdfUrl: string | null
  codeUrl: string | null
  openAccess: boolean
  embedding: number[]          // pgvector
  // 프리프린트 ↔ 출판본 병합용
  mergedInto: string | null
}

type Assessment = {
  paperId: string
  track: 'verified' | 'notable'       // 🟢 / 🟡
  field: 'cs' | 'bio_med' | 'social' | 'other'   // 가중치 선택
  stage1: { passed: boolean; retracted: boolean; predatoryVenue: boolean; paperMillSignals: string[] }
  stage2: { venueTier: string | null; reviewStatus: string; reviewScore: number | null; authorTrackRecord: number }
  stage3: {
    reproducibility: Score; design: Score; statistics: Score
    claimVsEvidence: Score; limitations: Score
    preregistered: boolean | null; studyDesign: string | null
  }
  stage4: { influentialCitations: number; githubStars: number | null; mentions: number }
  // UI에 그대로 노출되는 근거 문장. 항목별 1~2문장
  evidence: { stage: 1|2|3|4; verdict: 'pass' | 'caution'; text: string }[]
  caveats: string[]            // "영어 대화에서만 검증" 같은 유의점
  assessedAt: Date
}

type Score = { value: number; /* 0~1 */ reason: string }

type Interest = {
  id: string; userId: string
  label: string                // "LLM 에이전트의 장기 기억"
  embedding: number[]
  seedPaperIds: string[]       // 취향 보정용 대표 논문
}

type Brief = {
  id: string; userId: string; date: string   // YYYY-MM-DD
  issueNumber: number                        // 제12호
  readMinutes: number
  audioUrl: string | null
  audioSeconds: number | null
  items: BriefItem[]
}

type BriefItem = {
  paperId: string; interestId: string
  position: number
  oneLine: string               // 카드 한 줄 요약
  whyItMatters: string          // "왜 중요한가"
  method: string; results: { label: string; value: string }[]
  limitations: { bySource: 'author' | 'ai'; text: string }[]
  quotes: { text: string; locator: string }[]   // 원문 인용 + "§3.2, p.4"
  isSerendipity: boolean        // 관심 주제와 유사한(주변) 분야 논문 1편
}

type SavedItem = {
  userId: string; paperId: string
  savedAt: Date; readAt: Date | null
  memo: string | null
  followUp: { kind: 'accepted' | 'refuted' | 'updated'; text: string; at: Date } | null
}
```

**요약 텍스트는 하나의 데이터에서 길이만 다르게 뽑는다.** 폰 카드는 `oneLine` + `whyItMatters`, 웹 정독은 전체 + `quotes` + `results`. 별도로 두 번 생성하지 않는다.

---

## 5. 파이프라인

```
[03:00 KST]
 수집 ── arXiv, bioRxiv/medRxiv, PubMed, OpenAlex, Crossref, Semantic Scholar
  │      하루 수천~수만 편
  ▼
 중복 제거 ── DOI·제목 정규화로 프리프린트와 출판본 병합
  ▼
 관련성 필터 ── 관심사 임베딩과 코사인 유사도                    → 수백 편
  ▼
 ① 하드 필터 → ② 메타데이터 점수                                → 30~50편
  ▼
 ③ LLM 본문 정밀 평가 (오픈액세스 PDF)                          → ~10편
  ▼
 최종 랭킹 = 관련성 × 신뢰도 × 새로움(이미 본 주제는 감점)
  ▼
 요약 생성 → **사실 검증** (모든 수치·고유명사를 원문과 대조, 실패 시 삭제)
  ▼
 오디오 생성 (TTS) · 오프라인 캐시 프리빌드
  ▼
[사용자가 설정한 출발 시간 5분 전] 푸시 알림
```

**비용 설계**: 싼 필터가 앞에 오는 깔때기 구조 덕에 비싼 LLM 호출은 사용자당 하루 10~50회로 줄어든다. 공통 관심사를 가진 사용자끼리는 `Assessment`를 캐시해 공유한다 — 같은 논문을 두 번 평가하지 않는다.

**실패 처리**: 각 단계는 독립 실행 가능하고 결과를 DB에 남긴다. 한 단계가 죽어도 재시도로 이어갈 수 있어야 한다. 배달 시각까지 파이프라인이 끝나지 않으면 전날 미배달 논문으로 채우거나 편수를 줄여 보낸다 — 빈 브리핑을 보내지 않는다.

---

## 6. 요약 품질 원칙

- **환각 방지** — 요약의 모든 수치를 원문 문장과 대조 검증. 실패한 문장은 삭제한다
- **"그래서 뭐?"를 먼저** — 한 줄 요약보다 "기존 대비 무엇이 새로운가"를 앞에 둔다
- **수준 맞춤** — 입문자에게는 배경 설명, 연구자에게는 방법론 디테일
- **한계를 둘로 나눈다** — `저자 인정`과 `AI 관찰`을 구분해 표기한다. 후자가 이 서비스의 부가가치다

---

## 7. 로드맵

| 단계 | 기간 | 범위 |
|---|---|---|
| **MVP** | 4~6주 | arXiv + OpenAlex만, 관심사 3개, PWA + 푸시, 필터 ①②와 간단한 ③ |
| **v1** | +2개월 | PubMed·bioRxiv 추가, 분야별 가중치, 피드백 학습, 오디오 브리핑 |
| **v2** | +3개월 | 프리프린트 후속 추적, 정독 화면의 대화형 Q&A, 주간 트렌드 |
| **확장** | 이후 | 연구실·팀 공유 피드, Zotero·Notion 연동, B2B R&D팀 |

**PWA 우선, 네이티브는 나중.** 앱스토어 심사와 양 플랫폼 대응 때문에 검증이 늦어진다. 재방문율이 확인된 뒤에 네이티브로 넘어가 오디오·위젯·백그라운드 재생을 붙인다.

---

## 8. 리스크

| 리스크 | 대응 |
|---|---|
| **명성 편향** — 유명 기관·저자만 올라온다 | 저자 이력 가중치를 낮게, 내용 평가 우선. "신진 연구자의 좋은 논문 발굴"을 기능으로 내세울 수도 있다 |
| **필터 버블** | 관심사 주변 분야의 "유사 주제 1편"을 매일 포함 (`isSerendipity`) |
| **LLM 평가 오류** | `AI 보조 의견` 명시, 이의 제기 경로 제공, 근거 문장 노출로 검증 가능하게 |
| **경쟁** — Google Scholar 알림, Semantic Scholar 피드, Scholar Inbox | 차별점은 ①신뢰도 근거의 투명한 제시 ②두 트랙 구조 ③프리프린트 후속 추적 ④한국어 요약 |
| **오픈액세스가 아닌 논문** | 초록만으로 평가하고 그 사실을 UI에 표기. 본문 미확인 논문은 검증 트랙으로 올리지 않는다 |

---

## 9. 부록 — ③단계 LLM 평가 루브릭

`services/evaluator/prompts/deep-eval.md`의 기반. 각 항목은 **0~1 점수와 근거 문장 1개**를 함께 반환하게 한다. 근거 문장이 없는 점수는 버린다.

```
입력: 논문 본문(오픈액세스 PDF 텍스트), 분야, 게재처 정보
출력: JSON — 항목별 { value, reason }, caveats[], evidence[]

평가 항목
1. reproducibility  코드·데이터 링크가 실제로 접근 가능한가. 환경·시드가 명시되었나
2. design           표본 크기와 대조군/베이스라인이 주장에 비해 충분한가. ablation이 있나
3. statistics       효과크기·신뢰구간을 보고했나. 다중 비교 보정을 했나
4. claimVsEvidence  초록의 주장 강도가 결과 범위를 넘지 않는가. 인과를 과하게 주장하지 않는가
5. limitations      한계를 성실히 적었는가. 적지 않은 한계를 네가 발견했다면 caveats에 넣어라

금지
- 본문에 없는 수치를 만들지 말 것
- 저자·소속의 명성을 점수에 반영하지 말 것 (그건 ②단계에서 이미 다룬다)
- 판단이 어려우면 낮은 점수 대신 value를 null로 두고 이유를 적어라
```
