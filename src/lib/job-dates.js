// "2025-07" -> "July 2025". Job dates are the month the photos were shared, not an invoice date.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function monthLabel(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  if (!m) return '';
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}
