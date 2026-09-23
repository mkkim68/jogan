import { listInterests as queryListInterests, listSaved as queryListSaved } from '@jogan/db'
import { cache } from 'react'

/**
 * 요청 단위 리더 — React `cache()`로 감싸 셸(`(app)/layout.tsx`, `TopBar`)과 페이지가 같은
 * 요청 안에서 같은 인자로 이 함수를 부르면 실제 쿼리는 한 번만 나간다.
 *
 * 셸과 페이지 양쪽 모두 `@jogan/db`를 직접 부르지 말고 이 래퍼를 통해야 캐시가 공유된다.
 */
export const listInterests = cache(queryListInterests)
export const listSaved = cache(queryListSaved)
