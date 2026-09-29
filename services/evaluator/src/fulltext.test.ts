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
