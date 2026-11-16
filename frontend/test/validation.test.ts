import { describe, expect, it } from 'vitest'
import { agentCodeField, isCalendarDate, isPhone, optionalBirthDate, optionalEmail, phoneField, requiredText } from '../src/lib/validation'

const ok = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success

describe('isCalendarDate', () => {
  it('accepts real days only', () => {
    expect(isCalendarDate('2024-02-29')).toBe(true)
    for (const value of ['2023-02-29', '2024-02-30', '2024-13-01', '01/01/2024', '1899-12-31', '']) {
      expect(isCalendarDate(value), value).toBe(false)
    }
  })
})

describe('phone', () => {
  it('DATA-4: the formats the API accepts', () => {
    for (const value of ['0912345678', '+84912345678', '84912345678', '0912 345 678', '0912.345.678']) {
      expect(isPhone(value), value).toBe(true)
    }
    for (const value of ['091234567', '09123456789', 'abc', '12345']) {
      expect(isPhone(value), value).toBe(false)
    }
  })

  it('is required', () => {
    expect(ok(phoneField, '   ')).toBe(false)
    expect(ok(phoneField, '0912345678')).toBe(true)
  })
})

describe('other fields', () => {
  it('an email may be blank, but not wrong', () => {
    expect(ok(optionalEmail, '')).toBe(true)
    expect(ok(optionalEmail, ' a@b.vn ')).toBe(true)
    expect(ok(optionalEmail, 'a@b')).toBe(false)
  })

  it('a birth date may be blank, but not impossible or in the future', () => {
    expect(ok(optionalBirthDate, '')).toBe(true)
    expect(ok(optionalBirthDate, '1990-01-15')).toBe(true)
    expect(ok(optionalBirthDate, '2024-02-30')).toBe(false)
    expect(ok(optionalBirthDate, '2999-01-01')).toBe(false)
  })

  it('required text ignores spaces and respects the limit', () => {
    expect(ok(requiredText(5), '  ')).toBe(false)
    expect(ok(requiredText(5), ' abcde ')).toBe(true)
    expect(ok(requiredText(5), 'abcdef')).toBe(false)
  })

  it('DATA-1: an agent code keeps to digits', () => {
    expect(ok(agentCodeField, '00123')).toBe(true)
    expect(ok(agentCodeField, 'A123')).toBe(false)
  })
})
