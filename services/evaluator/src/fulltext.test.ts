import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fetchFullText, htmlToText } from './fulltext'

const html = readFileSync(join(import.meta.dirname, 'fixtures/arxiv-html.html'), 'utf8')

describe('htmlToText', () => {
  it('본문 텍스트를 뽑는다', () => {
    const t = htmlToText(html)
    expect(t).toContain('We propose a method.')
    expect(t).toContain('Our sample size is 12.')
  })

  it('script와 style은 버린다', () => {
    const t = htmlToText(html)
    expect(t).not.toContain('console.log')
    expect(t).not.toContain('margin: 0')
  })

  it('HTML 엔티티를 되돌린다', () => {
    expect(htmlToText('<p>Prior work &amp; ours &lt;here&gt;</p>')).toBe('Prior work & ours <here>')
  })

  it('공백을 하나로 줄인다', () => {
    expect(htmlToText('<p>a\n\n   b</p>')).toBe('a b')
  })

  it('태그가 없으면 빈 문자열이다', () => {
    expect(htmlToText('<html><head></head><body></body></html>')).toBe('')
  })

  it('닫는 태그 없는 self-closing script가 다음 </script>까지 집어삼키지 않는다', () => {
    // <script src="x.js"/>는 닫는 태그가 없다. 쌍으로만 매칭하는 정규식은 이 지점부터
    // "다음에 나오는 아무 </script>"까지를 전부 태그 내용으로 오인해 지워버린다 —
    // 그 사이에 있는 진짜 본문(예: Limitations 문단)이 통째로 사라질 수 있다.
    const html = '<p>keep me</p><script src="x.js"/><p>and me too</p><script>ignored</script>'
    expect(htmlToText(html)).toBe('keep me and me too')
  })

  it('HTML 주석 안의 텍스트는 새어나오지 않는다', () => {
    // 주석은 의도적으로 지운 내용이다 — 그 안에 수치가 있어도 검증 대상 원문에
    // 들어가면 안 된다 (verify.ts가 이 텍스트를 "원문"으로 믿고 대조하기 때문).
    const html = '<p>before</p><!-- <p>hidden draft number 999</p> --><p>after</p>'
    expect(htmlToText(html)).toBe('before after')
  })
})

describe('fetchFullText', () => {
  it('200이면 텍스트를 돌려준다', async () => {
    const client = { request: async () => new Response(html, { status: 200 }) }
    const t = await fetchFullText(client, '2609.00001')
    expect(t).toContain('We propose a method.')
  })

  it('HTML이 없으면(404) null이다 — 탈락이 아니다', async () => {
    const client = { request: async () => new Response('', { status: 404 }) }
    expect(await fetchFullText(client, '2609.00001')).toBeNull()
  })

  it('서버 오류도 null이다 — 본문 없이 진행한다', async () => {
    const client = { request: async () => new Response('', { status: 500 }) }
    expect(await fetchFullText(client, '2609.00001')).toBeNull()
  })

  it('네트워크 오류도 null이다', async () => {
    const client = { request: async () => { throw new Error('boom') } }
    expect(await fetchFullText(client, '2609.00001')).toBeNull()
  })
})
