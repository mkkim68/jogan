/** KST 기준 오늘 (YYYY-MM-DD). 배치가 새벽 3시 KST에 돌므로 날짜 기준도 KST다 */
export function todayInSeoul(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}
