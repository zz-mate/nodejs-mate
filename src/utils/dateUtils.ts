/** src/utils/dateUtils.ts */

/**
 * 自定义计算日期的年周数（替代 dayjs.week()）
 * 规则和 MySQL WEEK() 函数默认规则一致：
 * - 每周从周日开始（MySQL WEEK() 默认 mode=0）
 * - 第一周是包含本年1月1日的那一周（且至少有1天在本年）
 * @param dateStr 日期字符串（如 '2025-05-12'）或 Date 对象
 * @returns { week: number, year: number } 周数（1-53）、年份
 */
export function getWeekOfYear(dateStr: string | Date): { week: number; year: number } {
    // 转换为 Date 对象
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (isNaN(date.getTime())) {
        throw new Error(`无效的日期：${dateStr}`);
    }

    // 复制日期对象，避免修改原日期
    const targetDate = new Date(date);
    // 重置时间为 00:00:00，避免时间影响
    targetDate.setHours(0, 0, 0, 0);

    // 1. 获取当年1月1日
    const year = targetDate.getFullYear();
    const firstDayOfYear = new Date(year, 0, 1); // 月份从0开始（0=1月）

    // 2. 计算当年1月1日是周几（0=周日，1=周一...6=周六）
    const firstDayWeekday = firstDayOfYear.getDay();

    // 3. 计算目标日期到1月1日的天数差
    const oneDayMs = 24 * 60 * 60 * 1000;
    const daysDiff = Math.floor((targetDate.getTime() - firstDayOfYear.getTime()) / oneDayMs) + 1;

    // 4. 计算周数（匹配 MySQL WEEK() mode=0 规则）
    let week: number;
    if (firstDayWeekday === 0) {
        // 1月1日是周日：第一周从1月1日开始
        week = Math.ceil(daysDiff / 7);
    } else {
        // 1月1日不是周日：第一周包含1月1日，不足7天也算第一周
        const firstWeekDays = 7 - firstDayWeekday;
        if (daysDiff <= firstWeekDays) {
            week = 1;
        } else {
            week = Math.ceil((daysDiff - firstWeekDays) / 7) + 1;
        }
    }

    // 处理跨年周（如2025年1月1日是周三，2024年12月29日-31日属于2025年第1周）
    let actualYear = year;
    if (week > 52 && targetDate.getMonth() === 0) {
        // 1月份但周数>52，属于上一年的最后一周
        actualYear = year - 1;
        week = getWeekOfYear(new Date(actualYear, 11, 31)).week; // 计算上一年最后一天的周数
    } else if (week === 0) {
        // 极少数情况周数为0，属于上一年的最后一周
        actualYear = year - 1;
        week = 52; // 兜底为52周
    }

    return { week, year: actualYear };
}

/**
 * 计算日期的月份（适配 dayjs.month() + 1）
 * @param dateStr 日期字符串
 * @returns 月份（1-12）
 */
export function getMonthOfYear(dateStr: string | Date): { month: number; year: number } {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (isNaN(date.getTime())) {
        throw new Error(`无效的日期：${dateStr}`);
    }
    return {
        month: date.getMonth() + 1, // 月份从0开始，转换为1-12
        year: date.getFullYear()
    };
}