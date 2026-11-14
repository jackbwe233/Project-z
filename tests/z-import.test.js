import { describe, expect, it } from 'vitest';
import { importCalendarIcs, importAssignmentsCsv, mergeImportedTasks } from '../lib/z-import.js';

describe('Z offline calendar and school imports', () => {
  it('reads ICS events, escaped names, folded lines, all-day and UTC dates', () => {
    const events = [
      'BEGIN:VCALENDAR', 'VERSION:2.0',
      'BEGIN:VEVENT', 'UID:abc', 'SUMMARY:Hockey\\, practice',
      'DTSTART;VALUE=DATE:20261115', 'END:VEVENT',
      'BEGIN:VEVENT', 'SUMMARY:Big exam',
      'DTSTART:20261116T190000Z', 'END:VEVENT',
      'BEGIN:VEVENT', 'SUMMARY:Cancelled', 'STATUS:CANCELLED',
      'DTSTART:20261117T080000', 'END:VEVENT',
      'BEGIN:VEVENT', 'SUMMARY:Invalid date', 'DTSTART;VALUE=DATE:20260231', 'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const out = importCalendarIcs(events);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ title: 'Hockey, practice', date: '2026-11-15', type: 'Event' });
    expect(out[1].title).toBe('Big exam');
    expect(out[1].time).toMatch(/^\d{2}:\d{2}$/);
  });
  it('rejects non-calendar input', () => {
    expect(() => importCalendarIcs('random text')).toThrow(/calendar/i);
  });
  it('parses quoted CSV schoolwork with due dates and class names', () => {
    const csv = [
      'Assignment,Due Date,Class,Time',
      '"Read, review and annotate",11/16/2026,English,16:00',
      'Finish report,2026-11-18,Statistics,',
      'Invalid,not a date,Math,',
    ].join('\n');
    const out = importAssignmentsCsv(csv);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ title: 'English: Read, review and annotate', date: '2026-11-16', time: '16:00', type: 'Assignment' });
    expect(out[1].date).toBe('2026-11-18');
  });
  it('rejects unsupported CSV headers or malformed quotes', () => {
    expect(() => importAssignmentsCsv('Question,Answer\nA,B')).toThrow(/Title/i);
    expect(() => importAssignmentsCsv('Title,Due Date\n"Unclosed,2026-11-16')).toThrow(/quoted/);
  });
  it('deduplicates reimports without deleting or replacing saved tasks', () => {
    const items = importAssignmentsCsv('Title,Due Date\nHomework,2026-11-16');
    const original = [{ ...items[0], id: 'keep', done: true }];
    const out = mergeImportedTasks(original, items, () => 'new');
    expect(out.added).toBe(0);
    expect(out.skipped).toBe(1);
    expect(out.tasks).toEqual(original);
  });
});
