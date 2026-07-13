// Time-bucket keys for period scoreboards. All UTC so bucket boundaries
// don't depend on where the server happens to run.

export function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

// ISO-8601 week: weeks start Monday, week 1 is the week containing the
// year's first Thursday (so the key's year can differ from the calendar
// year around Jan 1 / Dec 31).
export function isoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Shift to the Thursday of this ISO week (getUTCDay: Sun=0..Sat=6).
  const dayOfWeek = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function yearKey(date = new Date()) {
  return String(date.getUTCFullYear());
}
