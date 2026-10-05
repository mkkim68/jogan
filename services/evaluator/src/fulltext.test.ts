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

  it('따옴표 속성값 안의 "/>"를 self-closing으로 오인하지 않는다', () => {
    // <script data-x="foo/>bar">의 "/>"는 속성값의 일부 문자일 뿐이다. 이걸
    // self-closing 표시로 오인하면 진짜 스크립트 본문(여는 태그 바로 뒤)이
    // 닫는 태그 없이 그대로 본문에 남아버린다.
    const html = '<p>keep me</p><script data-x="foo/>bar">console.log(1)</script><p>and me too</p>'
    expect(htmlToText(html)).toBe('keep me and me too')
  })

  it('따옴표 속성값 안의 ">"도 태그 종료로 오인하지 않는다', () => {
    const html = '<p>keep me</p><script data-x="foo>bar">console.log(2)</script><p>and me too</p>'
    expect(htmlToText(html)).toBe('keep me and me too')
  })

  it('따옴표 속성값 안에 숨은 "-->"로 주석을 조기 종료시키지 않는다', () => {
    // <!-- <a href="-->fake.html">draft number 999</a> -->에서 첫 "-->"는
    // href 속성값 안에 있는 문자일 뿐이다. 이걸 진짜 종료로 오인하면 주석이
    // 일찍 끝나버려서 숨겨야 할 "draft number 999"가 그대로 새어나온다.
    const html = '<p>before</p><!-- <a href="-->fake.html">draft number 999</a> --><p>after</p>'
    expect(htmlToText(html)).toBe('before after')
  })

  it('평범한 주석은 사라지고 앞뒤 텍스트만 남는다', () => {
    const html = '<p>before</p><!-- just a plain comment --><p>after</p>'
    expect(htmlToText(html)).toBe('before after')
  })

  it('닫히지 않은 주석은 그 뒤를 전부 버린다', () => {
    // 어디서 끝나는지 모르면 뒤를 전부 버린다 — 숨겨야 할 텍스트가 새어나오는 쪽이
    // 본문 뒷부분이 잘리는 쪽보다 훨씬 나쁘다.
    const html = '<p>keep me</p><!-- 이 주석은 닫히지 않는다 <p>이건 살아남으면 안 된다</p>'
    expect(htmlToText(html)).toBe('keep me')
  })

  it('닫히지 않은 <script>는 그 뒤를 전부 버린다', () => {
    const html = '<p>keep me</p><script>var x = 1; // 이 스크립트는 닫히지 않는다'
    expect(htmlToText(html)).toBe('keep me')
  })

  it('주석 속 따옴표 짝이 안 맞아도 첫 -->에서 끝나고 뒤 문단은 살아남는다', () => {
    // y='6 is odd 뒤에 닫는 따옴표가 없다 — 보호 구간이 열린 채 끝까지 안 닫힌다.
    // 이걸 "종료를 못 찾았다"로 처리해 뒤를 전부 버리면, 진짜 있는 유일한 -->
    // 바로 뒤의 멀쩡한 문단(및 그 안의 수치 n=45)까지 통째로 사라진다.
    const html = "<p>keep me</p><!-- x=5, y='6 is odd --> <p>this real paragraph should survive n=45</p>"
    expect(htmlToText(html)).toBe('keep me this real paragraph should survive n=45')
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
