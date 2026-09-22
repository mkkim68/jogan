# ③단계 내용 정밀 평가

입력: 논문 본문(오픈액세스 PDF 텍스트), 분야, 게재처 정보
출력: JSON — 항목별 { value, reason }, caveats[], evidence[]

## 평가 항목 (각 0~1 점수 + 근거 문장 1개)

1. reproducibility  코드·데이터 링크가 실제로 접근 가능한가. 환경·시드가 명시되었나
2. design           표본 크기와 대조군/베이스라인이 주장에 비해 충분한가. ablation이 있나
3. statistics       효과크기·신뢰구간을 보고했나. 다중 비교 보정을 했나
4. claimVsEvidence  초록의 주장 강도가 결과 범위를 넘지 않는가. 인과를 과하게 주장하지 않는가
5. limitations      한계를 성실히 적었는가. 적지 않은 한계를 네가 발견했다면 caveats에 넣어라

의학·생명 분야 추가: preregistered (ClinicalTrials.gov 등 사전등록 여부), studyDesign (RCT > 코호트 > 관찰 > 사례보고)

## 금지

- 본문에 없는 수치를 만들지 말 것
- 저자·소속의 명성을 점수에 반영하지 말 것 (그건 ②단계에서 이미 다룬다)
- 판단이 어려우면 낮은 점수 대신 value를 null로 두고 이유를 적어라
- 근거 문장이 없는 점수는 버려진다
