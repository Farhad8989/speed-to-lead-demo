export interface TimeSlot {
  date: string;       // ISO date string e.g. "2026-04-18"
  time: string;       // e.g. "10:00 AM"
  displayLabel: string; // e.g. "Saturday, Apr 18 at 10:00 AM"
}

const SLOT_TIMES = ['9:00 AM', '10:00 AM', '11:00 AM', '2:00 PM', '3:00 PM', '4:00 PM'];
const SLOTS_PER_DAY = 3;
const DAYS_AHEAD = 5;

export function generateTimeSlots(from: Date = new Date()): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const cursor = new Date(from);

  // Start from next business day
  cursor.setDate(cursor.getDate() + 1);

  while (slots.length < DAYS_AHEAD * SLOTS_PER_DAY) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) { // skip weekends
      const dateStr = cursor.toISOString().split('T')[0];
      const label = cursor.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

      // Pick SLOTS_PER_DAY evenly spread times
      const times = SLOT_TIMES.filter((_, i) => i % Math.floor(SLOT_TIMES.length / SLOTS_PER_DAY) === 0).slice(0, SLOTS_PER_DAY);
      for (const time of times) {
        slots.push({ date: dateStr, time, displayLabel: `${label} at ${time}` });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return slots;
}
