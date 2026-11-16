import { describe, expect, it } from 'vitest'
import { APPLICATION_NO, POLICY_NO, canMove } from '../src/lib/leadStages'

describe('LEAD-19 moves', () => {
  it('never moves back to NEW; ISSUED is for lead managers', () => {
    expect(canMove('CONTACTED', 'APPOINTMENT', false)).toBe(true)
    expect(canMove('CONTACTED', 'NEW', true)).toBe(false)
    expect(canMove('PROPOSAL', 'ISSUED', false)).toBe(false)
    expect(canMove('ISSUED', 'LOST', false)).toBe(false)
    expect(canMove('PROPOSAL', 'ISSUED', true)).toBe(true)
    expect(canMove('MET', 'MET', true)).toBe(false)
  })

  it('checks the numbers SUBMITTED needs (LEAD-11)', () => {
    expect(APPLICATION_NO.test('HS12345')).toBe(true)
    expect(APPLICATION_NO.test('HS-1')).toBe(false)
    expect(POLICY_NO.test('012345678')).toBe(true)
    expect(POLICY_NO.test('12345678')).toBe(false)
  })
})
