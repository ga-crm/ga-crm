import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUIET_HOURS,
  inQuietHours,
  minutesOfDay,
  morningRoundDue,
  nextDayMonths,
  quietHoursOf,
  wantsInApp,
} from './notification-rules.js';

const vn = (time: string) => new Date(`2026-11-11T${time}:00+07:00`);

describe('notification rules', () => {
  it('NTF-3: everything is on until the user turns it off', () => {
    expect(wantsInApp(undefined, 'LEAD_ASSIGNED')).toBe(true);
    expect(
      wantsInApp({ LEAD_ASSIGNED: { inApp: false } }, 'LEAD_ASSIGNED'),
    ).toBe(false);
    expect(wantsInApp({ LEAD_ASSIGNED: { inApp: false } }, 'TASK_DUE')).toBe(
      true,
    );
  });

  it('NTF-3: quiet hours run past midnight, in Vietnam time', () => {
    expect(minutesOfDay('07:30')).toBe(450);
    expect(minutesOfDay('7:30')).toBeNull();
    expect(inQuietHours(vn('22:00'), DEFAULT_QUIET_HOURS)).toBe(true);
    expect(inQuietHours(vn('06:00'), DEFAULT_QUIET_HOURS)).toBe(true);
    expect(inQuietHours(vn('07:30'), DEFAULT_QUIET_HOURS)).toBe(false);
    expect(inQuietHours(vn('12:00'), { from: '12:00', to: '13:00' })).toBe(
      true,
    );
    expect(quietHoursOf({ from: 'x' })).toEqual(DEFAULT_QUIET_HOURS);
  });

  it('SIG-2: the morning round starts when quiet hours end', () => {
    expect(morningRoundDue(vn('07:29'), DEFAULT_QUIET_HOURS)).toBe(false);
    expect(morningRoundDue(vn('07:30'), DEFAULT_QUIET_HOURS)).toBe(true);
    expect(morningRoundDue(vn('20:59'), DEFAULT_QUIET_HOURS)).toBe(true);
    expect(morningRoundDue(vn('21:30'), DEFAULT_QUIET_HOURS)).toBe(false);
  });

  it('SIG-2: birthdays in the next 3 days cross month ends', () => {
    expect(nextDayMonths('2026-11-29', 3)).toEqual([
      '29/11',
      '30/11',
      '01/12',
      '02/12',
    ]);
  });
});
