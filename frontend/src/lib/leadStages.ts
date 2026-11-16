import type { LeadStage } from './types'

/** LEAD-19: what a manual move asks for. */
export const APPLICATION_NO = /^[A-Za-z0-9]{4,20}$/
export const POLICY_NO = /^\d{9}$/

/** LEAD-19: NEW is never a target; ISSUED (to or from) is for lead managers only. */
export function canMove(from: LeadStage, to: LeadStage, manages: boolean): boolean {
  if (from === to || to === 'NEW') return false
  if ((to === 'ISSUED' || from === 'ISSUED') && !manages) return false
  return true
}
