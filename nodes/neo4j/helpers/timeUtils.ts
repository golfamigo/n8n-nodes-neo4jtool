// timeUtils.ts
// Neo4j MCP 通用時間處理工具函數
import { DateTime } from 'luxon';
import neo4j from 'neo4j-driver';
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
			// 使用 convertNeo4jValueToJs 轉換 Neo4j Integer 到 JavaScript number
			return DateTime.fromObject({
				year: convertNeo4jValueToJs(timeInput.year),
				month: convertNeo4jValueToJs(timeInput.month),
				day: convertNeo4jValueToJs(timeInput.day),
				hour: convertNeo4jValueToJs(timeInput.hour),
				minute: convertNeo4jValueToJs(timeInput.minute),
				second: convertNeo4jValueToJs(timeInput.second),
				millisecond: convertNeo4jValueToJs(timeInput.nanosecond) / 1000000
			}, { zone: 'UTC' }).toUTC().toISO();
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
      // 嘗試解析 ISO 格式
      let dt = DateTime.fromISO(timeInput);
      if (dt.isValid) {
        return dt.toUTC().toISO();
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
export function utcToLocalTime(utcTime: string, timezone: string): string | null {
  try {
    if (!utcTime) return null;

    const dt = DateTime.fromISO(utcTime, { zone: 'UTC' });
    if (!dt.isValid) return null;
    return dt.setZone(timezone).toISO();
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
// 修正 generateTimeSlotsWithBusinessHours 函數中的 continue 問題
// 需要重構，避免跨函數邊界使用 continue
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
  const normalizedStart = normalizeDateTime(startDateTime);
  const normalizedEnd = normalizeDateTime(endDateTime);

  if (!normalizedStart || !normalizedEnd || !Array.isArray(businessHours)) {
    return [];
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

  while (currentDate < endDt) {
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
      });

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
      });

      // 調整當天的時間範圍
      const dayStart = DateTime.max(openTime, DateTime.fromISO(normalizedStart));
      const dayEnd = DateTime.min(closeTime, endDt);

      // 如果當天沒有有效時間範圍，跳過
      if (dayStart >= dayEnd) {
        continue; // 這個 continue 現在只在循環內使用
      }

      // 生成當天的時間槽
      let slotTime = dayStart;
      while (slotTime < dayEnd) {
        const slotISO = slotTime.toUTC().toISO();
        if (slotISO) { // 添加空值檢查
          slots.push(slotISO);
        }
        slotTime = slotTime.plus({ minutes: intervalMinutes });
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
  const slotStart = normalizeDateTime(slot);
  if (!slotStart) return false;

  const dtStart = DateTime.fromISO(slotStart);
  const dtEnd = dtStart.plus({ minutes: serviceDurationMinutes });

  // 獲取星期幾
  const dayOfWeek = dtStart.weekday;

  // 檢查是否在營業時間內
  const dayHours = businessHours.filter(bh => bh.day_of_week === dayOfWeek);

  // 如果當天沒有營業時間，不可用
  if (dayHours.length === 0) return false;

  // 檢查是否有任何一個營業時間段包含整個服務時段
  return dayHours.some(hours => {
    const businessStart = normalizeTimeOnly(hours.start_time);
    const businessEnd = normalizeTimeOnly(hours.end_time);

    if (!businessStart || !businessEnd) return false;

    const slotStartTime = dtStart.toFormat(TIME_SETTINGS.TIME_FORMAT);
    const slotEndTime = dtEnd.toFormat(TIME_SETTINGS.TIME_FORMAT);

    return businessStart <= slotStartTime && slotEndTime <= businessEnd;
  });
}
