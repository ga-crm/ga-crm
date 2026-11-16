import { buildIcs } from './ics.js';
import { weekDayMonths } from './work-rules.js';

describe('Today and calendar (TASK-5, TASK-6)', () => {
  it('TASK-5: this week runs Monday to Sunday as Success writes birthdays', () => {
    // 10/11/2026 is a Tuesday
    expect(weekDayMonths('2026-11-10').map((item) => item.dayMonth)).toEqual([
      '09/11',
      '10/11',
      '11/11',
      '12/11',
      '13/11',
      '14/11',
      '15/11',
    ]);
    expect(weekDayMonths('2026-12-31').at(-1)?.day).toBe('2027-01-03');
  });

  it('TASK-6: an iCalendar feed with escaped text, UTC times and folded lines', () => {
    const ics = buildIcs(
      'Lịch GA CRM',
      [
        {
          uid: 'task-1@gacrm',
          title: 'Gọi lại, hẹn; ký hợp đồng',
          start: new Date('2026-11-10T02:00:00Z'),
          minutes: 30,
          description: 'Dòng 1\nDòng 2 '.repeat(8),
        },
      ],
      new Date('2026-11-09T00:00:00Z'),
    );
    expect(ics).toContain('SUMMARY:Gọi lại\\, hẹn\\; ký hợp đồng');
    expect(ics).toContain('DTSTART:20261110T020000Z');
    expect(ics).toContain('DTEND:20261110T023000Z');
    expect(
      ics.split('\r\n').every((line) => Buffer.byteLength(line) <= 75),
    ).toBe(true);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  });
});
