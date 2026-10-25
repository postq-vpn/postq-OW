// What the pin guard did (netshift get_pin_guard_events): it left a server that was
// chosen by hand and stopped answering. Shown on the dashboard for a day.

export interface PinGuardEvent {
  time: number;
  section: string;
  from: string;
  to: string;
}

export const PIN_GUARD_SHOW_SECONDS = 86400;

export function parsePinGuardEvents(input: unknown): PinGuardEvent[] {
  let data: unknown = input;

  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .filter(
      (item) =>
        item &&
        typeof item.time === 'number' &&
        typeof item.section === 'string' &&
        typeof item.from === 'string' &&
        typeof item.to === 'string',
    )
    .map((item) => ({
      time: item.time,
      section: item.section,
      from: item.from,
      to: item.to,
    }));
}

// The events worth showing now (newest first): not older than a day.
export function recentPinGuardEvents(
  events: PinGuardEvent[],
  now: number,
): PinGuardEvent[] {
  return events
    .filter((event) => now - event.time <= PIN_GUARD_SHOW_SECONDS)
    .sort((a, b) => b.time - a.time);
}

// PostQ: the notice can be closed. What was closed is remembered as the time of
// the newest event shown then; only a newer switch brings the notice back.
const DISMISSED_KEY = 'netshift_pin_guard_dismissed';

export function undismissedPinGuardEvents(
  events: PinGuardEvent[],
  dismissedUntil: number,
): PinGuardEvent[] {
  return events.filter((event) => event.time > dismissedUntil);
}

// A per-viewer convenience only: any storage failure shows the notice again.
export function loadPinGuardDismissed(): number {
  try {
    const value = Number(window.localStorage.getItem(DISMISSED_KEY));

    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function savePinGuardDismissed(time: number) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, String(time));
  } catch {
    // storage is not available: the notice is closed until the page reloads
  }
}
