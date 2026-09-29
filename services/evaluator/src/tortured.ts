/**
 * 페이퍼밀이 표절 탐지를 피하려고 동의어 치환기를 돌렸을 때 남는 흔적.
 * 정상적인 논문은 이런 표현을 쓰지 않는다. Cabanac 등의 Problematic Paper Screener가
 * 모은 목록에서 널리 알려진 것만 추렸다 — 길게 가져갈수록 오탐이 는다.
 */
export const TORTURED_PHRASES: readonly string[] = [
  'colossal information', // big data
  'huge information',
  'counterfeit consciousness', // artificial intelligence
  'counterfeit neural organization', // artificial neural network
  'profound learning', // deep learning
  'machine learning calculation', // machine learning algorithm
  'irregular woodland', // random forest
  'support vector machine calculation',
  'bosom malignancy', // breast cancer
  'lung malignancy',
  'mean square blunder', // mean squared error
  'flag commotion proportion', // signal to noise ratio
  'underlying condition', // structural equation
  'bunching calculation', // clustering algorithm
  'choice tree', // decision tree — 오탐 위험이 있어 소문자 완전일치로만 본다
]
