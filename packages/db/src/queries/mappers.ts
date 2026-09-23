import {
  Assessment,
  BriefItem,
  Interest,
  Paper,
  PaperSummary,
  SavedItem,
  UserSettings,
} from '@jogan/core'

/**
 * DB 행 → 도메인 객체. 모든 읽기는 여기를 거친다.
 * core 스키마 .parse()로 끝나므로 DB가 돌려준 모양이 도메인 계약과 어긋나면 즉시 터진다.
 */

export function rowToPaper(row: unknown): Paper {
  return Paper.parse(row)
}

export function rowToPaperSummary(row: unknown): PaperSummary {
  return PaperSummary.parse(row)
}

export function rowToAssessment(row: unknown): Assessment {
  return Assessment.parse(row)
}

export function rowToBriefItem(row: unknown): BriefItem {
  return BriefItem.parse(row)
}

export function rowToSavedItem(row: unknown): SavedItem {
  // followUp.at은 jsonb라 ISO 문자열로 온다. SavedItem의 z.coerce.date()가 Date로 되돌린다.
  return SavedItem.parse(row)
}

export function rowToInterest(row: unknown): Interest {
  return Interest.parse(row)
}

export function rowToUserSettings(row: { departureTime: string } & Record<string, unknown>): UserSettings {
  // pg time은 'HH:mm:ss'로 돌아온다. core는 'HH:mm'만 받는다.
  return UserSettings.parse({ ...row, departureTime: row.departureTime.slice(0, 5) })
}
