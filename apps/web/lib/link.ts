/** 원문 링크. DOI > arXiv > PDF 순 (CLAUDE.md 규칙 4) */
export function sourceUrl(paper: {
  doi: string | null
  arxivId: string | null
  pdfUrl: string | null
}): string | null {
  if (paper.doi) return `https://doi.org/${paper.doi}`
  if (paper.arxivId) return `https://arxiv.org/abs/${paper.arxivId}`
  return paper.pdfUrl
}
