import dayjs from 'dayjs';

/**
 * 辅助函数：计算指定年份+周数对应的周一和周日（中国习惯：周一为一周开始）
 * @param year 年份（如 2025）
 * @param week 周数（1-53）
 * @returns { monday: string, sunday: string } 周一和周日的日期（YYYY-MM-DD）
 */
function getWeekRange(year: number, week: number): { monday: string; sunday: string } {
    // 计算当年1月1日是周几（0=周日，1=周一...6=周六）
    const firstDayOfYear = new Date(year, 0, 1);
    const firstDayWeekday = firstDayOfYear.getDay();

    // 计算第一周的周一：如果1月1日是周一，就是1月1日；否则往前推（7 - firstDayWeekday + 1）天
    let firstWeekMonday: Date;
    if (firstDayWeekday === 1) {
        firstWeekMonday = firstDayOfYear;
    } else if (firstDayWeekday === 0) {
        // 1月1日是周日，第一周周一为上一年12月26日
        firstWeekMonday = new Date(year, 0, 1 - 6);
    } else {
        // 1月1日是周二到周六，往前推 (firstDayWeekday - 1) 天
        firstWeekMonday = new Date(year, 0, 1 - (firstDayWeekday - 1));
    }

    // 计算目标周的周一：第一周周一 + (week - 1) 周 * 7 天
    const targetMonday = new Date(firstWeekMonday);
    targetMonday.setDate(firstWeekMonday.getDate() + (week - 1) * 7);

    // 计算目标周的周日：周一 + 6 天
    const targetSunday = new Date(targetMonday);
    targetSunday.setDate(targetMonday.getDate() + 6);

    // 格式化为 YYYY-MM-DD（使用 dayjs 保证格式统一，仅用格式化功能）
    const format = (date: Date) => dayjs(date).format('YYYY-MM-DD');
    return {
        monday: format(targetMonday),
        sunday: format(targetSunday)
    };
}

/**
 * 根据预算周期类型，生成标准的周期开始/结束日期
 * @param cycleType 周期类型：year/month/week/day
 * @param value 周期值（如 2025 年、5 月、20 周、15 日）
 * @returns { start: string, end: string } 标准日期格式（YYYY-MM-DD）
 */
export function formatCycleDate(cycleType: 'year' | 'month' | 'week' | 'day', value: number | string) {
    const currentYear = dayjs().year();
    const currentMonth = dayjs().month() + 1; // 转为1-12
    const currentDay = dayjs().date();
    const currentWeek = (() => {
        // 计算当前周数（备用：当value为空时使用）
        const now = new Date();
        const year = now.getFullYear();
        const firstWeekMon = getWeekRange(year, 1).monday;
        const daysDiff = Math.floor((now.getTime() - new Date(firstWeekMon).getTime()) / (24 * 60 * 60 * 1000));
        return Math.ceil(daysDiff / 7) + 1;
    })();

    // 解析入参值，兜底为当前周期值
    const numValue = Number(value);
    const year = numValue || currentYear; // 年/月/周/日的默认年份都是当前年
    let start = '';
    let end = '';

    switch (cycleType) {
        case 'year':
            // 年周期：开始为 YYYY-01-01，结束为 YYYY-12-31
            start = dayjs(`${year}-01-01`).format('YYYY-MM-DD');
            end = dayjs(`${year}-12-31`).format('YYYY-MM-DD');
            break;

        case 'month':
            // 月周期：开始为 YYYY-MM-01，结束为当月最后一天
            const month = numValue || currentMonth; // 兜底为当前月
            const monthFirstDay = dayjs(`${year}-${month}-01`);
            start = monthFirstDay.format('YYYY-MM-DD');
            end = monthFirstDay.endOf('month').format('YYYY-MM-DD');
            break;

        case 'week':
            // 周周期：开始为周一，结束为周日（纯原生逻辑，无dayjs week依赖）
            const week = numValue || currentWeek; // 兜底为当前周
            const { monday, sunday } = getWeekRange(year, week);
            start = monday;
            end = sunday;
            break;

        case 'day':
            // 日周期：开始和结束都是当天
            const day = numValue || currentDay; // 兜底为当前日
            start = dayjs(`${year}-${currentMonth}-${day}`).format('YYYY-MM-DD');
            end = start;
            break;

        default:
            throw new Error(`不支持的周期类型：${cycleType}`);
    }

    // 校验日期合法性
    if (!dayjs(start).isValid() || !dayjs(end).isValid()) {
        throw new Error(`生成的日期不合法：start=${start}, end=${end}`);
    }

    return { start, end };
}