import type { Tour } from '@/features/tours/domain/entities/tour';

/**
 * One tour plotted on one calendar day. A multi-day tour yields one entry per day of its
 * span, each knowing where it sits in that span — `dayIndex` is 1-based, so day 2 of 3 is
 * `{ dayIndex: 2, dayCount: 3 }`. Both are required: "an entry knows its position" is the
 * invariant the whole span rendering rests on, and optional fields would scatter `?? 1`
 * across every read site. A single-day tour is an honest `{ dayIndex: 1, dayCount: 1 }`.
 */
export interface DayEntry {
  tour: Tour;
  isFriend: boolean;
  dayIndex: number;
  dayCount: number;
}

/** A single cell in the month grid. */
export interface MonthCell {
  date: Date;
  /** False for leading/trailing days that belong to the adjacent month. */
  inMonth: boolean;
}

/**
 * Build a Monday-start, 6-week (42-cell) grid covering the month that
 * `viewDate` falls in, including the leading/trailing adjacent-month days that
 * fill the first and last weeks. Six rows are always emitted so the grid height
 * never jumps between months.
 */
export function buildMonthGrid(viewDate: Date): MonthCell[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  // JS getDay(): 0=Sun … 6=Sat. Shift so Monday=0 … Sunday=6.
  const mondayOffset = (first.getDay() + 6) % 7;
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(year, month, 1 - mondayOffset + i);
    cells.push({ date, inMonth: date.getMonth() === month });
  }
  return cells;
}

/**
 * Local-time `YYYY-MM-DD` key for bucketing tours onto calendar days. Uses the
 * date's own local components (not `toISOString`, which would shift across the
 * UTC boundary and land a tour on the wrong day).
 */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Every `dayKey` a tour's planned span covers, `start` through `end` inclusive. A null,
 * undefined or not-after-start `end` collapses to the single start day, so a single-day
 * tour behaves exactly as it did before spans existed.
 *
 * Walks LOCAL calendar date parts (`new Date(y, m, d + i)`) rather than adding 86_400_000 ms:
 * a span crossing a DST transition would otherwise drop or duplicate a day. This is the only
 * place span day keys are minted — no call site derives them itself.
 */
export function spanDayKeys(start: Date, end: Date | null): string[] {
  const first = dayKey(start);
  const last = end ? dayKey(end) : first;
  // Lexical compare is safe: `YYYY-MM-DD` sorts chronologically.
  if (last <= first) return [first];

  const keys: string[] = [];
  const y = start.getFullYear();
  const m = start.getMonth();
  const d = start.getDate();
  for (let i = 0; ; i++) {
    const key = dayKey(new Date(y, m, d + i));
    keys.push(key);
    if (key >= last) return keys;
  }
}

/**
 * Today's day key — the single source of truth for the availability past/future
 * cutoff and for "is this cell selectable". Deliberately the same `dayKey`
 * (device-local) the calendar already uses to place tours on days, so the cutoff
 * and the cells it compares against can never disagree.
 *
 * Client/DB agreement does not rely on a shared timezone constant: the DB never
 * derives "now" for availability (the query cutoff is passed in and the RPC only
 * applies the day arrays it's given), so a plain calendar date means the same day
 * everywhere. If any DB code later needs "today", it MUST take it from the client
 * — not `current_date` — to preserve this.
 */
export function todayKey(): string {
  return dayKey(new Date());
}
