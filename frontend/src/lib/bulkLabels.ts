import { normalizeName } from './agentTree'

/** Open question D: what "add many" accepts in one go (the API checks the same). */
export const MAX_BULK = 200
export const MAX_LABEL = 60

export interface BulkPreview {
  /** New labels, trimmed, in the order given. */
  labels: string[]
  /** Already in the list, or repeated in the input (OPT-4: case and diacritics do not count). */
  duplicates: string[]
  /** Longer than 60 characters (OPT-3). */
  tooLong: string[]
}

/**
 * What is typed or pasted: one label per line. Cells pasted from Excel arrive tab-separated, so
 * only the first is kept; commas belong to the label ("Hà Nội, nội thành").
 */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split('\t')[0].trim())
    .filter(Boolean)
}

/** The first column of a CSV or text file (comma, semicolon or tab separated; quotes respected). */
export function splitCsv(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const first = line.startsWith('"') ? (/^"((?:[^"]|"")*)"/.exec(line)?.[1]?.replace(/""/g, '"') ?? line) : line.split(/[,;\t]/)[0]
      return first.trim()
    })
    .filter(Boolean)
}

export function previewLabels(lines: string[], existing: string[]): BulkPreview {
  const seen = new Set(existing.map(normalizeName))
  const preview: BulkPreview = { labels: [], duplicates: [], tooLong: [] }
  for (const raw of lines) {
    const label = raw.trim()
    if (!label) continue
    if (label.length > MAX_LABEL) {
      preview.tooLong.push(label)
      continue
    }
    const key = normalizeName(label)
    if (seen.has(key)) {
      preview.duplicates.push(label)
      continue
    }
    seen.add(key)
    preview.labels.push(label)
  }
  return preview
}

const COMMON_HEADERS = ['giá trị', 'gia tri', 'tên', 'nhãn', 'value', 'label', 'name']

/** A file's first row is a header when it names the list or says "Giá trị", "Tên", "Nhãn"... */
export function dropHeader(labels: string[], listName: string): string[] {
  const [first, ...rest] = labels
  if (first === undefined) return labels
  const headers = new Set([listName, ...COMMON_HEADERS].map(normalizeName))
  return headers.has(normalizeName(first)) ? rest : labels
}

/** The first column of the first sheet of an Excel file, or the lines of a text / CSV file. */
export async function readLabels(file: File, listName: string): Promise<string[]> {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    // The spreadsheet library is large, so it loads only when someone picks a workbook
    const { readWorkbook } = await import('./spreadsheet')
    const [sheet] = readWorkbook(await file.arrayBuffer())
    return dropHeader((sheet?.rows ?? []).map((row) => (row.cells[0] === null ? '' : String(row.cells[0]).trim())).filter(Boolean), listName)
  }
  return dropHeader(splitCsv(await file.text()), listName)
}
