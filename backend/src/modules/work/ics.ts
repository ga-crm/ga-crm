/** TASK-6: one entry of a person's calendar feed. */
export interface IcsEvent {
  uid: string;
  title: string;
  start: Date;
  /** A task is a point in time; an appointment gets an hour. */
  minutes: number;
  description?: string;
  url?: string;
}

/** RFC 5545: commas, semicolons, backslashes and line breaks are escaped in text. */
const text = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

/** RFC 5545 UTC form, `20261110T020000Z`. */
const stamp = (at: Date) =>
  at
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** RFC 5545: lines longer than 75 octets continue on the next line after a space. */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  for (const char of line) {
    if (Buffer.byteLength(current + char, 'utf8') > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = char;
    } else current += char;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** TASK-6: a read-only iCalendar feed. */
export function buildIcs(
  name: string,
  events: readonly IcsEvent[],
  now: Date,
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GA CRM//Lich//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${text(name)}`,
    'X-WR-TIMEZONE:Asia/Ho_Chi_Minh',
  ];
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(event.start)}`,
      `DTEND:${stamp(new Date(event.start.getTime() + event.minutes * 60_000))}`,
      `SUMMARY:${text(event.title)}`,
      ...(event.description ? [`DESCRIPTION:${text(event.description)}`] : []),
      ...(event.url ? [`URL:${event.url}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
