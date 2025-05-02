import { isTimeBetween } from '../timeUtils'; // Removed unused normalizeTimeOnly from this import

// Mock normalizeTimeOnly for simplicity in the isTimeBetween tests,
// assuming it correctly formats HH:MM:SS
jest.mock('../timeUtils', () => ({
  ...jest.requireActual('../timeUtils'), // Keep original implementations
  normalizeTimeOnly: jest.fn((timeInput: any) => {
    // Simple mock for HH:MM or HH:MM:SS format
    if (typeof timeInput === 'string') {
      const parts = timeInput.split(':');
      if (parts.length >= 2 && parts.length <= 3) {
        const h = String(parts[0]).padStart(2, '0');
        const m = String(parts[1]).padStart(2, '0');
        const s = parts[2] ? String(parts[2]).padStart(2, '0') : '00';
        // Basic validation
        if (parseInt(h) >= 0 && parseInt(h) < 24 && parseInt(m) >= 0 && parseInt(m) < 60 && parseInt(s) >= 0 && parseInt(s) < 60) {
          return `${h}:${m}:${s}`;
        }
      }
    }
    // Handle Date objects or other types if necessary, or return null for invalid
    // For this test, we primarily use strings, so basic string handling is enough.
    // Fallback for unexpected types in tests
    try {
       // Attempt actual normalization if it's not a simple string case we handle
       return jest.requireActual('../timeUtils').normalizeTimeOnly(timeInput);
    } catch {
       return null; // Or handle error appropriately
    }
  }),
}));


describe('isTimeBetween', () => {
  // Restore mock implementation after each test if needed, or setup before each
  beforeEach(() => {
    // Ensure normalizeTimeOnly mock is reset or configured if state changes between tests
    // (Current mock is stateless, so likely not needed unless we modify it per test)
  });

  // --- Normal Day Ranges (Start <= End) ---
  test('should return true for time within normal range (exclusive end)', () => {
    expect(isTimeBetween('10:00:00', '09:00:00', '17:00:00')).toBe(true);
  });

  test('should return true for time equal to start time (exclusive end)', () => {
    expect(isTimeBetween('09:00:00', '09:00:00', '17:00:00')).toBe(true);
  });

  test('should return false for time equal to end time (exclusive end)', () => {
    expect(isTimeBetween('17:00:00', '09:00:00', '17:00:00')).toBe(false);
  });

  test('should return true for time within normal range (inclusive end)', () => {
    expect(isTimeBetween('10:00:00', '09:00:00', '17:00:00', true)).toBe(true);
  });

  test('should return true for time equal to end time (inclusive end)', () => {
    expect(isTimeBetween('17:00:00', '09:00:00', '17:00:00', true)).toBe(true);
  });

  test('should return false for time before start time', () => {
    expect(isTimeBetween('08:59:59', '09:00:00', '17:00:00')).toBe(false);
  });

  test('should return false for time after end time', () => {
    expect(isTimeBetween('17:00:01', '09:00:00', '17:00:00')).toBe(false);
    expect(isTimeBetween('17:00:01', '09:00:00', '17:00:00', true)).toBe(false);
  });

  // --- Overnight Ranges (End < Start) ---
  test('should return true for time after start in overnight range (exclusive end)', () => {
    expect(isTimeBetween('23:00:00', '22:00:00', '06:00:00')).toBe(true); // Late evening
  });

  test('should return true for time before end in overnight range (exclusive end)', () => {
    expect(isTimeBetween('05:00:00', '22:00:00', '06:00:00')).toBe(true); // Early morning
  });

   test('should return true for time equal to start in overnight range (exclusive end)', () => {
    expect(isTimeBetween('22:00:00', '22:00:00', '06:00:00')).toBe(true);
  });

  test('should return false for time equal to end in overnight range (exclusive end)', () => {
    expect(isTimeBetween('06:00:00', '22:00:00', '06:00:00')).toBe(false);
  });

  test('should return true for time equal to end in overnight range (inclusive end)', () => {
    expect(isTimeBetween('06:00:00', '22:00:00', '06:00:00', true)).toBe(true);
  });

  test('should return false for time between end and start in overnight range', () => {
    expect(isTimeBetween('12:00:00', '22:00:00', '06:00:00')).toBe(false); // Mid-day
  });

  // --- Midnight End Ranges (End == '00:00:00') ---
  // Note: '00:00:00' as end time usually means "up to the end of the day starting from start time"
  test('should return true for time after start when end is midnight (exclusive end)', () => {
    expect(isTimeBetween('10:00:00', '09:00:00', '00:00:00')).toBe(true);
    expect(isTimeBetween('23:59:59', '09:00:00', '00:00:00')).toBe(true);
  });

   test('should return true for time equal to start when end is midnight (exclusive end)', () => {
    expect(isTimeBetween('09:00:00', '09:00:00', '00:00:00')).toBe(true);
  });

  test('should return false for time before start when end is midnight', () => {
    expect(isTimeBetween('08:59:59', '09:00:00', '00:00:00')).toBe(false);
  });

  // Inclusive end with midnight '00:00:00' is tricky.
  // If start is 09:00, end 00:00 inclusive means 09:00 today until 00:00 today (which is the start of today).
  // This interpretation might be less common. The code handles it as >= start.
  // Let's test the code's behavior.
  test('should return true for time after start when end is midnight (inclusive end)', () => {
     expect(isTimeBetween('10:00:00', '09:00:00', '00:00:00', true)).toBe(true);
     expect(isTimeBetween('23:59:59', '09:00:00', '00:00:00', true)).toBe(true);
  });

   test('should return true for time equal to start when end is midnight (inclusive end)', () => {
     expect(isTimeBetween('09:00:00', '09:00:00', '00:00:00', true)).toBe(true);
  });

   test('should return false for time before start when end is midnight (inclusive end)', () => {
     expect(isTimeBetween('08:59:59', '09:00:00', '00:00:00', true)).toBe(false);
  });

  // Special case: Full day 00:00:00 to 00:00:00
  test('should return true for any time when range is 00:00 to 00:00 (inclusive end)', () => {
    expect(isTimeBetween('00:00:00', '00:00:00', '00:00:00', true)).toBe(true);
    expect(isTimeBetween('12:00:00', '00:00:00', '00:00:00', true)).toBe(true);
    expect(isTimeBetween('23:59:59', '00:00:00', '00:00:00', true)).toBe(true);
  });

   test('should return true for start time when range is 00:00 to 00:00 (exclusive end)', () => {
     // 00:00 >= 00:00 is true
     expect(isTimeBetween('00:00:00', '00:00:00', '00:00:00', false)).toBe(true);
     expect(isTimeBetween('12:00:00', '00:00:00', '00:00:00', false)).toBe(true);
     expect(isTimeBetween('23:59:59', '00:00:00', '00:00:00', false)).toBe(true);
   });

});

// --- Tests for generateTimeSlotsWithBusinessHours ---
// We need the actual implementation for this, not the mock
// jest.unmock('../timeUtils'); // No need to unmock if the mock was specific to the first describe block
import { generateTimeSlotsWithBusinessHours, TIME_SETTINGS } from '../timeUtils'; // Removed unused normalizeDateTime
import { DateTime } from 'luxon';

describe('generateTimeSlotsWithBusinessHours', () => {
  const intervalMinutes = 30;
  const businessHoursSimple = [
    { day_of_week: 1, start_time: '09:00', end_time: '17:00' }, // Monday 9-5
    { day_of_week: 3, start_time: '10:00', end_time: '15:00' }, // Wednesday 10-3
  ];

  // Helper to create ISO strings easily for tests
  const createISO = (dateStr: string, timeStr: string) => {
    // Assume test inputs are in a specific timezone, e.g., UTC for simplicity, or convert
    // Using UTC for consistency with internal logic
    return DateTime.fromISO(`${dateStr}T${timeStr}`, { zone: TIME_SETTINGS.INTERNAL_TIMEZONE }).toISO();
  };

  test('should generate slots within a single day matching business hours', () => {
    const startDateTime = createISO('2024-01-01', '08:00:00'); // Monday
    const endDateTime = createISO('2024-01-01', '18:00:00');
    const slots = generateTimeSlotsWithBusinessHours(startDateTime, endDateTime, businessHoursSimple, intervalMinutes);

    // Expected slots: 9:00, 9:30, 10:00, ..., 16:30 on 2024-01-01
    expect(slots).toContain(createISO('2024-01-01', '09:00:00'));
    expect(slots).toContain(createISO('2024-01-01', '16:30:00'));
    expect(slots).not.toContain(createISO('2024-01-01', '08:30:00'));
    expect(slots).not.toContain(createISO('2024-01-01', '17:00:00')); // End time is exclusive for start slot
    expect(slots.length).toBe(16); // (17 - 9) * 2 = 16 slots
  });

  test('should generate slots across multiple days matching business hours', () => {
    const startDateTime = createISO('2024-01-01', '16:00:00'); // Monday
    const endDateTime = createISO('2024-01-03', '11:00:00');   // Wednesday
    const slots = generateTimeSlotsWithBusinessHours(startDateTime, endDateTime, businessHoursSimple, intervalMinutes);

    // Expected: Mon 16:00, 16:30. Tue: none. Wed: 10:00, 10:30.
    expect(slots).toContain(createISO('2024-01-01', '16:00:00'));
    expect(slots).toContain(createISO('2024-01-01', '16:30:00'));
    expect(slots).not.toContain(createISO('2024-01-01', '17:00:00'));
    expect(slots).not.toContain(createISO('2024-01-02', '09:00:00')); // Tuesday is closed
    expect(slots).toContain(createISO('2024-01-03', '10:00:00'));
    expect(slots).toContain(createISO('2024-01-03', '10:30:00'));
    expect(slots).not.toContain(createISO('2024-01-03', '11:00:00')); // End time is exclusive
    expect(slots.length).toBe(4);
  });

   test('should handle business hours with breaks', () => {
    const businessHoursWithBreak = [
      { day_of_week: 2, start_time: '09:00', end_time: '12:00' }, // Tuesday 9-12
      { day_of_week: 2, start_time: '13:00', end_time: '17:00' }, // Tuesday 1-5
    ];
    const startDateTime = createISO('2024-01-02', '08:00:00'); // Tuesday
    const endDateTime = createISO('2024-01-02', '18:00:00');
    const slots = generateTimeSlotsWithBusinessHours(startDateTime, endDateTime, businessHoursWithBreak, intervalMinutes);

    expect(slots).toContain(createISO('2024-01-02', '09:00:00'));
    expect(slots).toContain(createISO('2024-01-02', '11:30:00'));
    expect(slots).not.toContain(createISO('2024-01-02', '12:00:00'));
    expect(slots).not.toContain(createISO('2024-01-02', '12:30:00'));
    expect(slots).toContain(createISO('2024-01-02', '13:00:00'));
    expect(slots).toContain(createISO('2024-01-02', '16:30:00'));
    expect(slots.length).toBe(6 + 8); // (12-9)*2 + (17-13)*2 = 6 + 8 = 14 slots
  });

  test('should return empty array if no matching business hours', () => {
    const startDateTime = createISO('2024-01-02', '08:00:00'); // Tuesday
    const endDateTime = createISO('2024-01-02', '18:00:00');
    const slots = generateTimeSlotsWithBusinessHours(startDateTime, endDateTime, businessHoursSimple, intervalMinutes);
    expect(slots).toEqual([]);
  });

  test('should return empty array if startDateTime is after endDateTime', () => {
    const startDateTime = createISO('2024-01-01', '18:00:00');
    const endDateTime = createISO('2024-01-01', '08:00:00');
    const slots = generateTimeSlotsWithBusinessHours(startDateTime, endDateTime, businessHoursSimple, intervalMinutes);
    expect(slots).toEqual([]);
  });

   test('should handle different timezones in input (normalize to UTC)', () => {
    // Input in a different timezone, e.g., EST (UTC-5) as ISO strings
    const startDateTimeESTStr = '2024-01-01T09:00:00-05:00'; // 14:00 UTC
    const endDateTimeESTStr = '2024-01-01T18:00:00-05:00';   // 23:00 UTC
    const businessHoursUTC = [ // Business hours defined in UTC
      { day_of_week: 1, start_time: '14:00', end_time: '22:00' }, // Monday 14:00-22:00 UTC
    ];
    // Pass ISO strings directly to the function
    const slots = generateTimeSlotsWithBusinessHours(startDateTimeESTStr, endDateTimeESTStr, businessHoursUTC, 60); // 1 hour interval

    // Expect slots in UTC based on businessHoursUTC
    expect(slots).toContain(createISO('2024-01-01', '14:00:00')); // 14:00 UTC
    expect(slots).toContain(createISO('2024-01-01', '21:00:00')); // 4 PM EST
    expect(slots).not.toContain(createISO('2024-01-01', '22:00:00')); // End time exclusive
    expect(slots.length).toBe(8); // 14, 15, 16, 17, 18, 19, 20, 21
  });

});
