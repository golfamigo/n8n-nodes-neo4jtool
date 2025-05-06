// timeUtils.ts
// Neo4j MCP 通用時間處理工具函數
import { DateTime } from 'luxon';
import neo4j from 'neo4j-driver';
import { Session } from 'neo4j-driver';
import {
  convertNeo4jValueToJs,
} from './utils';

// 系統時間處理策略配置
export const TIME_SETTINGS = {
  // 系統內部標準時區 (所有節點應該統一使用)
  INTERNAL_TIMEZONE: 'UTC',

  // 標準儲存格式 (ISO 8601 UTC)
  STORAGE_FORMAT: "yyyy-MM-dd'T'HH:mm:ss'Z'",

  // 日期格式
  DATE_FORMAT: 'yyyy-MM-dd',

  // 時間格式
  TIME_FORMAT: 'HH:mm:ss',

  // 週天數值對照表 (ISO 週)
  WEEKDAYS: {
    MONDAY: 1,
    TUESDAY: 2,
    WEDNESDAY: 3,
    THURSDAY: 4,
    FRIDAY: 5,
    SATURDAY: 6,
    SUNDAY: 7
  }
};

/**
 * 將任意時間輸入轉換為標準 ISO 8601 UTC 字符串
 * @param timeInput 任意時間輸入 (字符串、Date、Neo4j DateTime等)
 * @param timezone 輸入的時區 (默認 UTC)
 * @returns 標準化的 ISO 8601 UTC 字符串，或 null
 */
export function normalizeDateTime(timeInput: any, timezone: string = TIME_SETTINGS.INTERNAL_TIMEZONE): string | null {
  if (timeInput === null || timeInput === undefined) {
    return null;
  }

  try {
    // 處理 Neo4j DateTime 類型
    if (neo4j.isDateTime(timeInput)) {
      // 轉換為標準 ISO 字符串，並確保在 UTC
      const dt = DateTime.fromObject({
        year: convertNeo4jValueToJs(timeInput.year),
        month: convertNeo4jValueToJs(timeInput.month),
        day: convertNeo4jValueToJs(timeInput.day),
        hour: convertNeo4jValueToJs(timeInput.hour),
        minute: convertNeo4jValueToJs(timeInput.minute),
        second: convertNeo4jValueToJs(timeInput.second),
        millisecond: convertNeo4jValueToJs(timeInput.nanosecond) / 1000000
      }, { zone: 'UTC' });

      // 確保返回完整 ISO 格式以兼容 Neo4j datetime()
      return dt.toUTC().toISO({ suppressMilliseconds: false });
    }

    // 處理 Neo4j Date 類型
		if (neo4j.isDate(timeInput)) {
			return DateTime.fromObject({
				year: convertNeo4jValueToJs(timeInput.year),
				month: convertNeo4jValueToJs(timeInput.month),
				day: convertNeo4jValueToJs(timeInput.day)
			}, { zone: 'UTC' }).toUTC().toISO();
		}

    // 處理 Neo4j LocalDateTime 類型
		if (neo4j.isLocalDateTime(timeInput)) {
			return DateTime.fromObject({
				year: convertNeo4jValueToJs(timeInput.year),
				month: convertNeo4jValueToJs(timeInput.month),
				day: convertNeo4jValueToJs(timeInput.day),
				hour: convertNeo4jValueToJs(timeInput.hour),
				minute: convertNeo4jValueToJs(timeInput.minute),
				second: convertNeo4jValueToJs(timeInput.second),
				millisecond: convertNeo4jValueToJs(timeInput.nanosecond) / 1000000
			}, { zone: timezone }).toUTC().toISO();
		}

    // 處理 JS Date 對象
    if (timeInput instanceof Date) {
      return DateTime.fromJSDate(timeInput).toUTC().toISO();
    }

    // 處理字符串
    if (typeof timeInput === 'string') {
      // 嘗試解析 ISO 格式 (包括帶偏移量的)
      // Set zone to 'utc' during parsing if no offset is present, otherwise keep the offset for conversion
      let dt = DateTime.fromISO(timeInput, { setZone: true }); // setZone: true preserves offset if present
      if (dt.isValid) {
        // Always convert to UTC for internal consistency
        return dt.toUTC().toISO({ suppressMilliseconds: false }); // Ensure consistent format
      }

      // 嘗試解析 SQL 格式
      dt = DateTime.fromSQL(timeInput);
      if (dt.isValid) {
        return dt.toUTC().toISO();
      }

      // 嘗試解析 HTTP 格式
      dt = DateTime.fromHTTP(timeInput);
      if (dt.isValid) {
        return dt.toUTC().toISO();
      }

      // 嘗試作為時間格式 (HH:MM:SS)
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeInput)) {
        // 添加今天的日期以獲取完整 DateTime
        const today = DateTime.now().toISODate();
        dt = DateTime.fromISO(`${today}T${timeInput}`, { zone: timezone });
        if (dt.isValid) {
          return dt.toUTC().toISO();
        }
      }
    }

    // 最後嘗試將數值解釋為時間戳
    if (typeof timeInput === 'number') {
      return DateTime.fromMillis(timeInput).toUTC().toISO();
    }

    // 無法處理
    console.warn(`Unable to normalize time format: ${timeInput}`);
    return null;
  } catch (error) {
    console.error(`Error normalizing time: ${error.message}`, timeInput);
    return null;
  }
}

/**
 * 將任意時間格式轉換為 Neo4j datetime() 參數格式
 * @param timeInput 任意時間輸入
 * @returns 適合在 Cypher 查詢中傳遞給 datetime() 函數的字符串
 */
// 修改 toNeo4jDateTimeString 函數確保空值處理
export function toNeo4jDateTimeString(timeInput: any): string | null {
  const iso = normalizeDateTime(timeInput);
  if (iso === null) return null;
  return iso;
}

// 將日期時間轉換為 Neo4j 可接受的字符串格式
export function toNeo4jDateTime(dateTime: any): string | null {
  const normalized = normalizeDateTime(dateTime);
  if (!normalized) return null;

  // 確保格式與 Neo4j datetime() 函數兼容
  return normalized.replace('Z', '');
}

// 獲取 ISO 星期幾 (1-7, 週一至週日)
export function getIsoWeekday(date: any): number | null {
  const normalized = normalizeDateTime(date);
  if (!normalized) return null;

  // Luxon 使用 ISO 週日格式 (1=週一, 7=週日)
  return DateTime.fromISO(normalized).weekday;
}

/**
 * 將任意時間輸入轉換為標準時間字符串 (僅時間部分，不含日期)
 * @param timeInput 任意時間輸入
 * @returns HH:MM:SS 格式的時間字符串
 */
export function normalizeTimeOnly(timeInput: any): string | null {
  if (timeInput === null || timeInput === undefined) {
    return null;
  }

  try {
    // 處理 Neo4j Time 類型
		if (neo4j.isTime(timeInput)) {
			return `${String(convertNeo4jValueToJs(timeInput.hour)).padStart(2, '0')}:${String(convertNeo4jValueToJs(timeInput.minute)).padStart(2, '0')}:${String(convertNeo4jValueToJs(timeInput.second)).padStart(2, '0')}`;
		}

    // 處理 Neo4j LocalTime 類型
    if (neo4j.isLocalTime(timeInput)) {
      return `${String(timeInput.hour).padStart(2, '0')}:${String(timeInput.minute).padStart(2, '0')}:${String(timeInput.second).padStart(2, '0')}`;
    }

    // 使用完整 datetime 規範化然後提取時間部分
    const normDateTime = normalizeDateTime(timeInput);
    if (normDateTime) {
      const dt = DateTime.fromISO(normDateTime);
      return dt.toFormat(TIME_SETTINGS.TIME_FORMAT);
    }

    return null;
  } catch (error) {
    console.error(`Error normalizing time: ${error.message}`, timeInput);
    return null;
  }
}

/**
 * 將任意時間格式轉換為 Neo4j time() 參數格式
 * @param timeInput 任意時間輸入
 * @returns 適合在 Cypher 查詢中傳遞給 time() 函數的字符串
 */
export function toNeo4jTimeString(timeInput: any): string | null {
  return normalizeTimeOnly(timeInput);
}

/**
 * 根據提供的時區將 UTC 時間轉換為本地時間
 * @param utcTime UTC 時間字符串
 * @param timezone 目標時區
 * @returns 轉換後的本地時間字符串
 */
// 修正 utcToLocalTime 函數的空值處理
export function utcToLocalTime(utcTime: string, timezone: string | number | true | object): string | null {
  try {
    if (!utcTime) return null;

    // 確保時區參數是字串型別
    const timezoneString = typeof timezone === 'string' ? timezone : 'UTC';

    const dt = DateTime.fromISO(utcTime, { zone: 'UTC' });
    if (!dt.isValid) return null;
    return dt.setZone(timezoneString).toISO();
  } catch (error) {
    console.error(`Error converting UTC to local time: ${error.message}`);
    return null;
  }
}

/**
 * 比較兩個時間值 (忽略日期部分)
 * @param time1 第一個時間值
 * @param time2 第二個時間值
 * @returns -1 (time1 < time2), 0 (time1 = time2), 1 (time1 > time2)
 */
export function compareTimeOnly(time1: any, time2: any): number {
  const t1 = normalizeTimeOnly(time1);
  const t2 = normalizeTimeOnly(time2);

  if (!t1 && !t2) return 0;
  if (!t1) return -1;
  if (!t2) return 1;

  return t1.localeCompare(t2);
}

/**
 * 檢查時間是否在特定範圍內 (僅時間部分)
 * @param time 要檢查的時間
 * @param startTime 開始時間
 * @param endTime 結束時間
 * @returns 是否在範圍內
 */
export function isTimeInRange(time: any, startTime: any, endTime: any): boolean {
  const normalizedTime = normalizeTimeOnly(time);
  const normalizedStart = normalizeTimeOnly(startTime);
  const normalizedEnd = normalizeTimeOnly(endTime);

  if (!normalizedTime || !normalizedStart || !normalizedEnd) {
    return false;
  }

  return normalizedStart <= normalizedTime && normalizedTime <= normalizedEnd;
}

/**
 * 在給定的日期時間上添加持續時間
 * @param dateTime 初始日期時間
 * @param durationMinutes 要添加的分鐘數
 * @returns 添加後的日期時間字符串
 */
export function addMinutesToDateTime(dateTime: any, durationMinutes: number): string | null {
  const normalized = normalizeDateTime(dateTime);
  if (!normalized) return null;

  try {
    const dt = DateTime.fromISO(normalized);
    return dt.plus({ minutes: durationMinutes }).toUTC().toISO();
  } catch (error) {
    console.error(`Error adding minutes to datetime: ${error.message}`);
    return null;
  }
}

/**
 * 獲取指定日期是星期幾
 * @param date 日期值
 * @returns 1-7 數字 (1=星期一, 7=星期日)
 */
export function getDayOfWeek(date: any): number | null {
  const normalized = normalizeDateTime(date);
  if (!normalized) return null;

  try {
    const dt = DateTime.fromISO(normalized);
    return dt.weekday; // Luxon: 1=星期一, 7=星期日
  } catch (error) {
    console.error(`Error getting day of week: ${error.message}`);
    return null;
  }
}

/**
 * 生成指定日期範圍內的時間槽
 * @param startDateTime 開始日期時間
 * @param endDateTime 結束日期時間
 * @param intervalMinutes 時間槽間隔 (分鐘)
 * @returns 時間槽列表 (ISO 8601 UTC 字符串)
 */
// 修正 generateTimeSlots 函數的變量作用域問題
export function generateTimeSlots(
  startDateTime: any,
  endDateTime: any,
  intervalMinutes: number = 15
): string[] {
  const normalizedStart = normalizeDateTime(startDateTime);
  const normalizedEnd = normalizeDateTime(endDateTime);

  if (!normalizedStart || !normalizedEnd) {
    return [];
  }

  const slots: string[] = []; // 確保在使用前先定義
  let currentSlot = DateTime.fromISO(normalizedStart);
  const endDt = DateTime.fromISO(normalizedEnd);

  while (currentSlot < endDt) {
    const slotISO = currentSlot.toUTC().toISO();
    if (slotISO) { // 添加空值檢查
      slots.push(slotISO);
    }
    currentSlot = currentSlot.plus({ minutes: intervalMinutes });
  }

  return slots; // 不需要再次排序，因為是按順序添加的
}

/**
 * 生成指定日期範圍內的時間槽，考慮業務營業時間
 * @param startDateTime 開始日期時間
 * @param endDateTime 結束日期時間
 * @param businessHours 業務營業時間列表
 * @param intervalMinutes 時間槽間隔 (分鐘)
 * @returns 符合營業時間的時間槽列表 (ISO 8601 UTC 字符串)
 */
export function generateTimeSlotsWithBusinessHours(
  startDateTime: any,
  endDateTime: any,
  businessHours: Array<{
    day_of_week: number;
    start_time: any;
    end_time: any;
  }>,
  intervalMinutes: number = 15
): string[] {
  // 確保時間正規化為統一格式
  let normalizedStart = normalizeDateTime(startDateTime);
  let normalizedEnd = normalizeDateTime(endDateTime);

  if (!normalizedStart || !normalizedEnd || !Array.isArray(businessHours)) {
    return [];
  }

  // 如果帶有時區，轉換為 UTC 時間來確保一致性
  const dtStart = DateTime.fromISO(normalizedStart);
  const dtEnd = DateTime.fromISO(normalizedEnd);

  // 如果輸入時間帶有時區信息且不是 UTC，轉換為 UTC
  if (dtStart.isValid && dtStart.zoneName !== 'UTC') {
    normalizedStart = dtStart.toUTC().toISO();
  }

  if (dtEnd.isValid && dtEnd.zoneName !== 'UTC') {
    normalizedEnd = dtEnd.toUTC().toISO();
  }

  // 規範化業務時間
  const hoursMap = new Map<number, Array<{startTime: string, endTime: string}>>();

  for (const bh of businessHours) {
    if (bh && typeof bh.day_of_week === 'number') {
      const dayOfWeek = bh.day_of_week;
      const startTime = normalizeTimeOnly(bh.start_time);
      const endTime = normalizeTimeOnly(bh.end_time);

      if (startTime && endTime) {
        if (!hoursMap.has(dayOfWeek)) {
          hoursMap.set(dayOfWeek, []);
        }
        const dayHours = hoursMap.get(dayOfWeek);
        if (dayHours) {
          dayHours.push({
            startTime,
            endTime
          });
        }
      }
    }
  }

  // 生成時間槽
  const slots: string[] = [];
  let currentDate = DateTime.fromISO(normalizedStart).startOf('day');
  const endDt = DateTime.fromISO(normalizedEnd);
  const loopEndDate = endDt.startOf('day'); // Compare against the start of the end day

  // Loop through each day from the start date up to and including the end date's start of day
  while (currentDate <= loopEndDate) {
    const dayOfWeek = currentDate.weekday;
    const dayHours = hoursMap.get(dayOfWeek) || [];

    for (const hours of dayHours) {
      // 構建當天的營業開始和結束時間
      let hourParts = hours.startTime.split(':');
      let hourVal = parseInt(hourParts[0], 10);
      let minuteVal = parseInt(hourParts[1], 10);

      if (isNaN(hourVal) || isNaN(minuteVal)) {
        continue; // 如果無法解析時間，跳過此時間段
      }

      const openTime = currentDate.set({
        hour: hourVal,
        minute: minuteVal,
        second: 0,
        millisecond: 0
      }).setZone('UTC');

      hourParts = hours.endTime.split(':');
      hourVal = parseInt(hourParts[0], 10);
      minuteVal = parseInt(hourParts[1], 10);

      if (isNaN(hourVal) || isNaN(minuteVal)) {
        continue; // 如果無法解析時間，跳過此時間段
      }

      const closeTime = currentDate.set({
        hour: hourVal,
        minute: minuteVal,
        second: 0,
        millisecond: 0
      }).setZone('UTC');

      // Adjust the day's time range based on business hours and overall query range
      // Ensure times are compared within the same day context or handle overnight explicitly
      const normalizedStartUTC = DateTime.fromISO(normalizedStart).setZone('UTC');
      const endDtUTC = endDt.setZone('UTC');

      let dayStart = openTime.setZone('UTC');
      let dayEnd = closeTime.setZone('UTC');

      // Handle overnight business hours (e.g., 22:00 to 06:00)
      if (dayEnd <= dayStart) {
          // If business hours cross midnight, consider the end time as being on the next day
          dayEnd = dayEnd.plus({ days: 1 });
      }

      // Calculate the intersection with the overall query range
      const effectiveDayStart = DateTime.max(dayStart, normalizedStartUTC);
      const effectiveDayEnd = DateTime.min(dayEnd, endDtUTC);

      // console.log(`[SLOT] Day: ${currentDate.toISODate()}, Hours: ${hours.startTime}-${hours.endTime}, QueryRange: ${normalizedStartUTC.toISO()}-${endDtUTC.toISO()}, Effective: ${effectiveDayStart.toISO()}-${effectiveDayEnd.toISO()}`);

      // If there's a valid time range for the current day's business hours within the query range
      if (effectiveDayStart < effectiveDayEnd) { // Use < to ensure at least one slot is possible
         // Generate slots starting from effectiveDayStart
         let slotTime = effectiveDayStart;
         while (slotTime < effectiveDayEnd) { // Loop until the effective end time (exclusive)
           const slotISO = slotTime.toUTC().toISO({ suppressMilliseconds: false }); // Ensure UTC output and consistent format
           if (slotISO) {
             // Add slot if it's not already present (shouldn't be needed with correct logic, but as a safeguard)
             if (!slots.includes(slotISO)) {
                slots.push(slotISO);
                // console.log('[SLOT] push:', slotISO);
             }
           }
           slotTime = slotTime.plus({ minutes: intervalMinutes });
         }
         // console.log(`[SLOT] Generated slots for ${effectiveDayStart.toISO()} ~ ${effectiveDayEnd.toISO()}`);
      }
    }

    // 移至下一天
    currentDate = currentDate.plus({ days: 1 });
  }

  return slots.sort();
}

/**
 * 根據服務時長檢查時間槽是否可用
 * @param slot 時間槽開始時間
 * @param serviceDurationMinutes 服務時長 (分鐘)
 * @param businessHours 業務營業時間
 * @returns 是否可用
 */
export function isSlotAvailableWithinBusinessHours(
  slot: any,
  serviceDurationMinutes: number,
  businessHours: Array<{
    day_of_week: number;
    start_time: any;
    end_time: any;
  }>
): boolean {
  const normalizedSlot = normalizeDateTime(slot);
  if (!normalizedSlot) return false;

  const slotStart = DateTime.fromISO(normalizedSlot);
  const slotEnd = slotStart.plus({ minutes: serviceDurationMinutes });
  const dayOfWeek = slotStart.weekday;

  const dayHours = businessHours.filter(bh => bh.day_of_week === dayOfWeek);

  if (dayHours.length === 0) {
    return false; // 當天不營業
  }

  // 檢查是否完全落在某個營業時間段內
  return dayHours.some(hours => {
    const openTime = normalizeTimeOnly(hours.start_time);
    const closeTime = normalizeTimeOnly(hours.end_time);
    const slotStartTime = slotStart.toFormat(TIME_SETTINGS.TIME_FORMAT);
    const slotEndTime = slotEnd.toFormat(TIME_SETTINGS.TIME_FORMAT);

    return openTime && closeTime &&
           openTime <= slotStartTime &&
           slotEndTime <= closeTime;
  });
}

/**
 * Helper function to check if time t1 is between start and end (inclusive start, exclusive end by default)
 * Handles HH:mm:ss format.
 * @param t1 Time string to check
 * @param start Start time string
 * @param end End time string
 * @param inclusiveEnd If true, includes the end time in the check (<= end). Defaults to false (< end).
 * @returns boolean
 */
export function isTimeBetween(t1: string, start: string, end: string, inclusiveEnd: boolean = false): boolean {
    // 規範化輸入時間格式，確保格式一致
    const time = normalizeTimeOnly(t1) || '';
    const startTime = normalizeTimeOnly(start) || '';
    const endTime = normalizeTimeOnly(end) || '';

    // 檢查是否跨午夜的時間範圍 (end < start 表示跨午夜)
    const isOvernightRange = endTime < startTime && endTime !== '00:00:00';

    // 處理特殊情況：結束時間為午夜 '00:00:00'
    const isEndMidnight = endTime === '00:00:00';

    // 分情況處理時間檢查
    if (isOvernightRange) {
        // 跨午夜情況: 時間在開始時間之後 或 時間在結束時間之前
        return time >= startTime || (inclusiveEnd ? time <= endTime : time < endTime);
    } else if (isEndMidnight) {
        // 午夜結束情況: 午夜視為下一天的開始，因此時間必須在開始時間之後
        // If inclusiveEnd is true, any time is valid if start is 00:00:00 and end is 00:00:00 (full day)
        if (inclusiveEnd && startTime === '00:00:00') return true;
        // Otherwise, check if time is >= start time
        return time >= startTime;
    } else {
        // 正常情況: 時間在開始和結束之間
        return time >= startTime && (inclusiveEnd ? time <= endTime : time < endTime);
    }
}

/**
 * 將 UTC 時間轉換為目標時區的時間格式
 * @param utcTime UTC 時間字符串
 * @param targetTimezone 目標時區
 * @returns 轉換後的時間字符串
 */
export function convertToTimezone(utcTime: string, targetTimezone: string | number | true | object): string {
  if (!utcTime) return utcTime;

  try {
    // 確保時區參數是字串型別
    const targetTimezoneString = typeof targetTimezone === 'string' ? targetTimezone : 'UTC';
    
    // 若無有有效的時區字串，使用預設值
    if (!targetTimezoneString) return utcTime;

    const dt = DateTime.fromISO(utcTime, { zone: 'UTC' });
    if (!dt.isValid) return utcTime;

    const result = dt.setZone(targetTimezoneString).toISO();
    return result || utcTime; // 確保一定返回字符串
  } catch (error) {
    console.error(`Error converting to timezone: ${error.message}`);
    return utcTime;
  }
}

/**
 * 從數據庫獲取商家的時區設置
 * @param session Neo4j 會話
 * @param businessId 商家 ID
 * @returns 商家時區或預設值 'UTC'
 */
export async function getBusinessTimezone(session: Session, businessId: string): Promise<string> {
  if (!session || !businessId) return 'UTC';

  try {
    const query = `
      MATCH (b:Business {business_id: $businessId})
      RETURN b.timezone AS timezone
    `;

    const result = await session.run(query, { businessId });
    const timezoneValue = result.records.length > 0 ? result.records[0].get('timezone') : null;
    
    // 確保傳回的是字串型別
    const businessTimezoneString = typeof timezoneValue === 'string' ? timezoneValue : 'UTC';
    return businessTimezoneString;
  } catch (error) {
    console.error(`Error getting business timezone: ${error.message}`);
    return 'UTC';
  }
}

/**
 * 檢測查詢時間字符串中的時區信息
 * @param dateTimeStr 時間字符串
 * @returns 時區字符串或 null
 */
export function detectQueryTimezone(dateTimeStr: string): string | null {
  if (!dateTimeStr) return null;

  try {
    // 測試 ISO 8601 格式的時區標記 (如 +08:00, -05:00)
    const tzMatch = dateTimeStr.match(/([+-])(\d{2}):?(\d{2})$/);
    if (tzMatch) {
      const [_, sign, hours, minutes] = tzMatch;
      return `${sign}${hours}:${minutes}`;
    }

    // 測試命名時區 (如 'Asia/Taipei')
    const dt = DateTime.fromISO(dateTimeStr);
    if (dt.isValid && dt.zoneName && dt.zoneName !== 'UTC') {
      return dt.zoneName;
    }

    return null; // 無時區信息
  } catch (error) {
    console.error(`Error detecting timezone: ${error.message}`);
    return null;
  }
}
