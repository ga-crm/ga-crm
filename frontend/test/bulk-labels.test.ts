import { describe, expect, it } from 'vitest'
import { dropHeader, previewLabels, splitCsv, splitLines } from '../src/lib/bulkLabels'

describe('adding many catalogue values (open question D)', () => {
  it('typed or pasted: one label per line, commas kept, the first of several pasted Excel cells', () => {
    expect(splitLines('Miền Bắc\r\n\n  Miền Trung  \nHà Nội, nội thành\nMiền Nam\tghi chú')).toEqual(['Miền Bắc', 'Miền Trung', 'Hà Nội, nội thành', 'Miền Nam'])
  })

  it('a CSV file: the first column, with quotes respected', () => {
    expect(splitCsv('"Hà Nội, nội thành",thủ đô\nMiền Nam;x\n\nTây Nguyên')).toEqual(['Hà Nội, nội thành', 'Miền Nam', 'Tây Nguyên'])
  })

  it('drops a header row that names the list or says what the column holds', () => {
    expect(dropHeader(['Lý do chốt xịt', 'Phí cao'], 'Lý do chốt xịt')).toEqual(['Phí cao'])
    expect(dropHeader(['Giá trị', 'Phí cao'], 'Lý do chốt xịt')).toEqual(['Phí cao'])
    expect(dropHeader(['Phí cao', 'Đã mua bên khác'], 'Lý do chốt xịt')).toEqual(['Phí cao', 'Đã mua bên khác'])
  })

  it('keeps new labels in order and sets aside duplicates (any case or diacritics) and labels over 60 characters', () => {
    const preview = previewLabels(['Miền Bắc', 'mien bac', 'Tây Nguyên', 'x'.repeat(61), 'Miền Nam'], ['Miền Nam'])
    expect(preview).toEqual({ labels: ['Miền Bắc', 'Tây Nguyên'], duplicates: ['mien bac', 'Miền Nam'], tooLong: ['x'.repeat(61)] })
  })
})
