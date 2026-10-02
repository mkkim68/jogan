import { describe, expect, it } from 'vitest'
import { jsonBodyOf } from './llm-json'

describe('jsonBodyOf', () => {
  it('코드블록 안의 내용을 꺼낸다', () => {
    expect(jsonBodyOf('```json\n{"a": 1}\n```')).toBe('{"a": 1}')
  })

  it('코드블록 없이 앞에 문장이 붙으면 첫 { 부터 마지막 } 까지 (HISTORY 2026-10-01)', () => {
    expect(jsonBodyOf('평가를 진행하겠습니다.\n\n{"a": {"b": 2}}\n끝')).toBe('{"a": {"b": 2}}')
  })

  it('닫히지 않은 잘린 응답은 그대로 돌려줘 JSON 파싱이 실패하게 둔다', () => {
    expect(jsonBodyOf('앞말 {"a": 1')).toBe('앞말 {"a": 1')
  })

  it('중괄호가 없으면 앞뒤 공백만 지운다', () => {
    expect(jsonBodyOf('  관련 없음  ')).toBe('관련 없음')
  })
})
