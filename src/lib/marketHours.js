/**
 * Market hours utilities for NYSE/NASDAQ (America/New_York timezone)
 * Market is open Mon-Fri 9:30 AM – 4:00 PM ET
 */

const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 30;
const MARKET_CLOSE_HOUR = 16;
const MARKET_CLOSE_MINUTE = 0;
const TZ = 'America/New_York';

/**
 * Get the current time as a Date object interpreted in ET.
 * We use Intl to extract ET date parts.
 */
function getETDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'), // 0-23
    minute: get('minute'),
    second: get('second'),
    dayOfWeek: new Date(
      Date.UTC(get('year'), get('month') - 1, get('day'))
    ).getUTCDay(), // 0=Sun, 6=Sat — but we need the ET weekday
  };
}

/**
 * Get current ET weekday (0=Sun, 1=Mon, ..., 6=Sat)
 */
function getETDayOfWeek(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
  });
  const dayStr = formatter.format(date);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[dayStr] ?? 0;
}

/**
 * Returns true if the market is currently open.
 */
export function isMarketOpen(now = new Date()) {
  const dow = getETDayOfWeek(now);
  if (dow === 0 || dow === 6) return false; // weekend

  const parts = getETDateParts(now);
  const { hour, minute } = parts;

  const afterOpen =
    hour > MARKET_OPEN_HOUR ||
    (hour === MARKET_OPEN_HOUR && minute >= MARKET_OPEN_MINUTE);
  const beforeClose =
    hour < MARKET_CLOSE_HOUR ||
    (hour === MARKET_CLOSE_HOUR && minute < MARKET_CLOSE_MINUTE);

  return afterOpen && beforeClose;
}

/**
 * Returns the next market open time as a Date (UTC).
 */
export function getNextMarketOpen(now = new Date()) {
  // Start from today's ET date
  const parts = getETDateParts(now);
  let candidate = new Date(now);

  // Try up to 7 days ahead
  for (let i = 0; i <= 7; i++) {
    const checkDate = new Date(candidate.getTime() + i * 24 * 60 * 60 * 1000);
    const dow = getETDayOfWeek(checkDate);
    if (dow === 0 || dow === 6) continue; // skip weekends

    const cp = getETDateParts(checkDate);

    // Build an ET open time for this day using toLocaleString hack
    // We construct an ISO-like string in ET and convert to UTC
    const etOpenStr = `${cp.year}-${String(cp.month).padStart(2, '0')}-${String(cp.day).padStart(2, '0')}T${String(MARKET_OPEN_HOUR).padStart(2, '0')}:${String(MARKET_OPEN_MINUTE).padStart(2, '0')}:00`;

    // Convert ET string to UTC Date using a known offset technique
    const etOpen = zonedToUTC(etOpenStr, TZ);

    if (etOpen > now) {
      return etOpen;
    }
  }

  // Fallback: next Monday 9:30 ET
  return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
}

/**
 * Returns the next market close time as a Date (UTC).
 * If market is currently open, returns today's close.
 */
export function getNextMarketClose(now = new Date()) {
  const parts = getETDateParts(now);

  for (let i = 0; i <= 7; i++) {
    const checkDate = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dow = getETDayOfWeek(checkDate);
    if (dow === 0 || dow === 6) continue;

    const cp = getETDateParts(checkDate);
    const etCloseStr = `${cp.year}-${String(cp.month).padStart(2, '0')}-${String(cp.day).padStart(2, '0')}T${String(MARKET_CLOSE_HOUR).padStart(2, '0')}:${String(MARKET_CLOSE_MINUTE).padStart(2, '0')}:00`;
    const etClose = zonedToUTC(etCloseStr, TZ);

    if (etClose > now) {
      return etClose;
    }
  }

  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Converts a local datetime string (YYYY-MM-DDTHH:mm:ss) in a given IANA
 * timezone to a UTC Date. Uses the Intl API trick.
 */
function zonedToUTC(localStr, timezone) {
  // Parse the local string as if it were UTC, then find the offset
  const assumed = new Date(localStr + 'Z');

  // Format that assumed UTC date in the target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const formatted = formatter.format(assumed);
  // formatted looks like "YYYY-MM-DD, HH:mm:ss"
  const reformatted = formatted.replace(', ', 'T');
  const inTZ = new Date(reformatted + 'Z');
  const offsetMs = inTZ - assumed;

  return new Date(assumed.getTime() - offsetMs);
}

/**
 * Format a Date for display.
 */
export function formatETTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Returns a label like "Mon, Mar 28, 9:30 AM ET"
 */
export function formatNextOpen(date) {
  return formatETTime(date) + ' ET';
}

/**
 * Returns today's ET date as YYYY-MM-DD string.
 */
export function getTodayET(now = new Date()) {
  const parts = getETDateParts(now);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/**
 * Get milliseconds until next market open (or 0 if open).
 */
export function msUntilNextOpen(now = new Date()) {
  if (isMarketOpen(now)) return 0;
  const next = getNextMarketOpen(now);
  return Math.max(0, next - now);
}

/**
 * Get milliseconds until market close (or 0 if already closed).
 */
export function msUntilClose(now = new Date()) {
  if (!isMarketOpen(now)) return 0;
  const close = getNextMarketClose(now);
  return Math.max(0, close - now);
}
