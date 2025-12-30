import pool from "../../db";
import { formatAmount, parseJsonToArray } from "../../utils/tools";

class CalendarModule {
  billTableName = "mate_bill";

  async calendarMonth(
    userId: number,
    bookId: number,
    start_time: string
  ): Promise<{
    dailyList: {
      year: string;
      month: string;
      day: string;
      income: string;
      expense: string;
    }[];
  }> {
    // 1. 基础参数校验
    if (!userId || !start_time) {
      console.warn("calendarMonth 参数缺失：", { userId, start_time });
      return {
        dailyList: [],
      };
    }

    // 初始化每日收支列表
    let dailyList: {
      year: string;
      month: string;
      day: string;
      income: string;
      expense: string;
    }[] = [];

    try {
      // 构建时间条件和查询参数
      let timeCondition = "";
      const baseParams: any[] = [userId];
      let isMonthQuery = false; // 标记是否为整月查询
      let queryYear = "";
      let queryMonth = "";

      // 匹配 YYYY-MM-DD（精确到日）
      if (start_time.match(/^\d{4}-\d{2}-\d{2}$/)) {
        timeCondition = "DATE(b.bill_time) = ?";
        baseParams.push(start_time);
        // 单日查询时，dailyList 只返回当天数据
        const year = start_time.split("-")[0];
        const month = start_time.split("-")[1];
        const day = start_time.split("-")[2];
        dailyList = [{ day, year, month, income: "0.00", expense: "0.00" }];
      }
      // 匹配 YYYY-MM（查询整月）
      else if (start_time.match(/^\d{4}-\d{2}$/)) {
        isMonthQuery = true;
        timeCondition = 'DATE_FORMAT(b.bill_time, "%Y-%m") = ?';
        baseParams.push(start_time);
        // 解析年月，用于生成每日日期
        [queryYear, queryMonth] = start_time.split("-");
      }
      // 日期格式错误
      else {
        console.warn("日期格式错误，支持 YYYY-MM-DD 或 YYYY-MM：", start_time);
        return {
          dailyList: [],
        };
      }

      // 构建 WHERE 条件（补充 bookId 筛选）
      const whereConditions = [
        "b.user_id = ?",
        timeCondition,
        "b.is_deleted = 0",
      ];
      if (bookId) {
        whereConditions.push("b.book_id = ?");
        baseParams.push(bookId);
      }

      // 整月查询时，统计每日收支明细
      if (isMonthQuery && queryYear && queryMonth) {
        const dailySql = `
                SELECT
                    DATE_FORMAT(b.bill_time, '%d') AS day,
                    COALESCE(SUM(CASE WHEN b.type = '1' THEN b.amount ELSE 0 END), 0) AS income,
                    COALESCE(SUM(CASE WHEN b.type = '2' THEN b.amount ELSE 0 END), 0) AS expense
                FROM ${this.billTableName} b
                WHERE ${whereConditions.join(" AND ")}
                GROUP BY DATE_FORMAT(b.bill_time, '%d')
                ORDER BY day ASC
            `;
        const [dailyResult] = await pool.execute(dailySql, baseParams);
        // 转换为键值对，方便补全日期
        const dailyMap = new Map<string, { income: string; expense: string }>();
        (dailyResult as any[]).forEach((item) => {
          dailyMap.set(item.day, {
            income: formatAmount(item.income) as string,
            expense: formatAmount(item.expense) as string,
          });
        });

        // 生成当月所有日期，补全无数据的日期（收入支出为0.00）
        const allDays = this.generateMonthDays(
          Number(queryYear),
          Number(queryMonth)
        );
        dailyList = allDays.map((day) => ({
          year: queryYear,
          month: queryMonth,
          day,
          income: dailyMap.get(day)?.income || "0.00",
          expense: dailyMap.get(day)?.expense || "0.00",
        }));
      }

      // 返回精简结果
      return {
        dailyList,
      };
    } catch (error: any) {
      console.error("calendarMonth 查询失败：", {
        userId,
        bookId,
        start_time,
        error: error.message,
        stack: error.stack,
      });
      return {
        dailyList: [],
      };
    }
  }

  /**
   * 日历日期维度账单明细查询（新增type收支筛选+兼容YYYY-MM格式+参数类型转换）
   * @param userId 用户ID（必传）
   * @param bookId 账本ID（0 表示查询所有账本）
   * @param start_time 时间范围（支持 YYYY-MM / YYYY-MM-DD / YYYY-MM-DD~YYYY-MM-DD）
   * @param page 页码（默认1）
   * @param pageSize 每页条数（默认20）
   * @param category_id 分类ID（可选，不传/传0则不筛选）
   * @param type 收支类型（可选，1=收入，2=支出，100=结余，默认空不筛选）
   * @returns 分页账单明细+汇总数据
   */
  async calendarDate(
    userId: number | string, // 兼容字符串/数字入参
    bookId: number | string, // 兼容字符串/数字入参
    start_time: string,
    page: number | string = 1, // 兼容字符串/数字入参
    pageSize: number | string = 20, // 兼容字符串/数字入参
    category_id?: number | string | null, // 兼容字符串/数字入参
    type?: 1 | 2 | 100 | string | null // 新增：收支类型（兼容字符串/数字）
  ): Promise<any> {
    // 统一参数类型转换（解决前端传字符串ID的问题）
    const userIdNum = Number(userId);
    const bookIdNum = Number(bookId);
    const pageNum = Number(page);
    const pageSizeNum = Number(pageSize);
    const categoryIdNum = category_id ? Number(category_id) : null;
    const typeNum = type ? Number(type) : null; // 收支类型转数字

    // 1. 基础参数校验（转换后校验）
    if (!userIdNum || !start_time) {
      console.warn("calendarDate 参数缺失：", {
        userId: userIdNum,
        start_time,
      });
      return {
        list: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalIncome: "0.00",
        totalExpense: "0.00",
      };
    }

    // 2. 分页参数处理（防非法值）
    const validPageNum = Math.max(1, isNaN(pageNum) ? 1 : pageNum);
    const validPageSize = Math.min(
      100,
      Math.max(1, isNaN(pageSizeNum) ? 20 : pageSizeNum)
    );
    const offset = (validPageNum - 1) * validPageSize;

    try {
      // 3. 构建时间条件（新增支持 YYYY-MM 格式）
      let timeCondition = "";
      const baseParams: any[] = [userIdNum];

      // 格式1：YYYY-MM（整月查询）
      if (start_time.match(/^\d{4}-\d{2}$/)) {
        timeCondition = 'DATE_FORMAT(b.bill_time, "%Y-%m") = ?';
        baseParams.push(start_time);
      }
      // 格式2：YYYY-MM-DD（单日查询）
      else if (start_time.match(/^\d{4}-\d{2}-\d{2}$/)) {
        timeCondition = "DATE(b.bill_time) = ?";
        baseParams.push(start_time);
      }
      // 格式3：YYYY-MM-DD~YYYY-MM-DD（日期范围查询）
      else if (start_time.match(/^\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}$/)) {
        const [startDate, endDate] = start_time.split("~");
        timeCondition = "DATE(b.bill_time) BETWEEN ? AND ?";
        baseParams.push(startDate, endDate);
      }
      // 日期格式错误
      else {
        console.warn(
          "日期格式错误，支持 YYYY-MM / YYYY-MM-DD 或 YYYY-MM-DD~YYYY-MM-DD：",
          start_time
        );
        return {
          list: [],
          total: 0,
          page: validPageNum,
          pageSize: validPageSize,
          totalIncome: "0.00",
          totalExpense: "0.00",
        };
      }

      // 4. 构建 WHERE 条件（包含账本+分类+收支类型筛选）
      const whereConditions = [
        "b.user_id = ?",
        timeCondition,
        "b.is_deleted = 0",
      ];

      // 账本筛选（转换后校验）
      if (bookIdNum && bookIdNum > 0) {
        whereConditions.push("b.book_id = ?");
        baseParams.push(bookIdNum);
      }

      // 分类筛选（转换后校验）
      if (categoryIdNum !== null && categoryIdNum > 0) {
        whereConditions.push("b.category_id = ?");
        baseParams.push(categoryIdNum);
      }

      // 新增：收支类型筛选（1=收入，2=支出，100=结余（不筛选，汇总时计算））
      if (typeNum === 1) {
        whereConditions.push("b.type = ?");
        baseParams.push("1"); // 收入
      } else if (typeNum === 2) {
        whereConditions.push("b.type = ?");
        baseParams.push("2"); // 支出
      }
      // type=100（结余）：不筛选类型，同时查收入+支出

      // 5. 查询总条数 + 总收入/总支出（一次查询提升性能）
      const countAndSumSql = `
            SELECT
                COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN b.type = '1' THEN b.amount ELSE 0 END), 0) AS totalIncome,
                COALESCE(SUM(CASE WHEN b.type = '2' THEN b.amount ELSE 0 END), 0) AS totalExpense
            FROM ${this.billTableName} b
            WHERE ${whereConditions.join(" AND ")}
        `;
      const [countSumResult] = await pool.execute(countAndSumSql, baseParams);
      const total = (countSumResult as any[])[0]?.total || 0;
      const totalIncomeNum =
        Number((countSumResult as any[])[0]?.totalIncome) || 0;
      const totalExpenseNum =
        Number((countSumResult as any[])[0]?.totalExpense) || 0;

      // 格式化汇总金额
      const totalIncome = formatAmount(totalIncomeNum);
      const totalExpense = formatAmount(totalExpenseNum);
      // 计算结余（仅type=100时返回）
      const totalBalance = formatAmount(totalIncomeNum - totalExpenseNum);

      // 6. 查询账单明细列表（关联分类、账本表）
      const listSql = `
            SELECT
                b.id, b.user_id, b.amount, b.type, b.currency,
                DATE_FORMAT(b.bill_time, '%H:%i') AS bill_time, -- 补全完整日期，便于前端展示
                DATE_FORMAT(b.bill_time, '%Y-%m-%d') AS bill_date, -- 补全完整日期，便于前端展示
                b.tags, b.remark, b.category_id, b.book_id,
                -- 转换时区并格式化创建/更新时间（UTC→东八区）
                DATE_FORMAT(CONVERT_TZ(b.created_at, '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s') AS created_at,
                DATE_FORMAT(CONVERT_TZ(b.updated_at, '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s') AS updated_at,
                -- 分类表字段（带前缀）
                c.id AS c_id, c.name AS c_name, c.icon AS c_icon, c.type AS c_type,
                -- 账本表字段（带前缀）
                bo.id AS bo_id, bo.name AS bo_name, bo.is_default AS bo_is_default
            FROM ${this.billTableName} b
                     LEFT JOIN mate_category c ON b.category_id = c.id
                     LEFT JOIN mate_book bo ON b.book_id = bo.id
            WHERE ${whereConditions.join(" AND ")}
            ORDER BY b.bill_time DESC
            LIMIT ?, ?
        `;

      // 拼接分页参数（数字类型，避免字符串转换问题）
      const queryParams = [
        ...baseParams,
        offset.toString(),
        validPageSize.toString(),
      ];
      const [listRows] = await pool.execute(listSql, queryParams);

      // 7. 格式化账单列表（分类/账本封装为对象）
      const formattedRows = (listRows as any[]).map((item) => ({
        // 账单基础字段
        id: item.id,
        user_id: item.user_id,
        amount: formatAmount(item.amount), // 金额格式化
        type: item.type, // 1=收入 2=支出
        currency: item.currency,
        bill_time: item.bill_time, // 完整时间 YYYY-MM-DD HH:mm
        bill_date: item.bill_date, // 完整时间 YYYY-MM-DD HH:mm
        tags: parseJsonToArray(item.tags),
        remark: item.remark,
        category_id: item.category_id,
        book_id: item.book_id,
        created_at: item.created_at,
        updated_at: item.updated_at,
        status: true,
        // 分类信息（空值返回空对象）
        category: item.c_id
          ? {
              id: item.c_id,
              name: item.c_name,
              icon: item.c_icon,
              type: item.c_type,
            }
          : {},
        // 账本信息（空值返回空对象）
        book: item.bo_id
          ? {
              id: item.bo_id,
              name: item.bo_name,
              is_default: item.bo_is_default,
            }
          : {},
      }));

      // 8. 返回结构化结果（type=100时新增totalBalance）
      const result = {
        list: formattedRows,
        total,
        page: validPageNum,
        pageSize: validPageSize,
        totalIncome,
        totalExpense,
      };
      // 仅type=100时返回结余字段
      if (typeNum === 100) {
        (result as any).totalBalance = totalBalance;
      }

      return result;
    } catch (error: any) {
      console.error("calendarDate 查询失败：", {
        userId: userIdNum,
        bookId: bookIdNum,
        start_time,
        page: validPageNum,
        pageSize: validPageSize,
        category_id: categoryIdNum,
        type: typeNum,
        error: error.message,
        stack: error.stack,
      });
      // 异常返回基础结构，type=100时补充结余
      const baseResult = {
        list: [],
        total: 0,
        page: validPageNum,
        pageSize: validPageSize,
        totalIncome: "0.00",
        totalExpense: "0.00",
      };
      if (typeNum === 100) {
        (baseResult as any).totalBalance = "0.00";
      }
      return baseResult;
    }
  }

    /**
     * 日历月维度图表数据查询（支持年/年月/日期/区间查询）
     * @param userId 用户ID（必传）
     * @param bookId 账本ID（0 表示查询所有账本）
     * @param start_time 时间范围（支持 YYYY / YYYY-MM / YYYY-MM-DD / YYYY-MM~YYYY-MM）
     * @param end_time 时间范围（支持 YYYY / YYYY-MM / YYYY-MM-DD）
     * @param type 数据类型：1=收入，2=支出，100=结余（默认100）
     * @returns 适配图表渲染的结构化数据
     */
    async calendarMonthChart(
        userId: number,
        bookId: number,
        start_time: string,
        end_time?: string,
        type: 1 | 2 | 100 = 100
    ): Promise<{
        chartData: {
            lineData: {
                xData: number[]; // 年维度：[1,2,...12]（月份）；日维度：[1,2,...31]（日期）
                xAxisData: string[]; // 对应金额，无数据为0
                summary: {
                    totalCount: number;
                    totalAmount: string | number;
                    timeRange: string; // 时间范围：2024年 | 2024年04月 | 2024年01月 ~ 2024年12月
                };
                list: Array<{
                    day: number; // 年维度：月份数字；日维度：日期数字
                    date: string; // 年维度：YYYY-MM；日维度：YYYY-MM-DD
                    dateStr: string; // 年维度：2025年10月；日维度：2025年10月1日
                    amount: string;
                    count: number;
                    ratio: number;
                    ratioPercent: string;
                }>;
            };
            PieData: {
                summary: {
                    totalCategory: number;
                    totalAmount: string | number;
                    type: string;
                    timeRange: string; // 同lineData的timeRange规则
                };
                list: Array<{
                    categoryId: number | null;
                    name: string;
                    icon: string;
                    value: string | number;
                    count: number;
                    ratio: number;
                    ratioPercent: string;
                    type: string;
                }>;
            };
        };
    }> {
        // 金额格式化（支持负数）
        const formatAmount = (amount: any): string => {
            if (amount === null || amount === undefined || amount === "")
                return "0.00";
            const num = Number(amount);
            return isNaN(num) ? "0.00" : num.toFixed(2);
        };

        // 安全转换时间字符串
        const safeTimeToString = (time: any): string => {
            if (typeof time === "string") return time.trim();
            if (time instanceof Date) return time.toISOString();
            if (time === null || time === undefined) return "";
            if (typeof time === "number") {
                return new Date(time).toISOString();
            }
            return String(time).trim();
        };

        // 时间降序比较
        const compareTimeDesc = (aTime: any, bTime: any): number => {
            const timeA = safeTimeToString(aTime) || "1970-01-01T00:00:00.000Z";
            const timeB = safeTimeToString(bTime) || "1970-01-01T00:00:00.000Z";
            return timeB.localeCompare(timeA);
        };

        // 饼图按百分比降序排序
        const sortPieDataByPercent = (list: any[]) => {
            return list.sort((a, b) => {
                const aPercent = Number(a.ratioPercent);
                const bPercent = Number(b.ratioPercent);
                return bPercent - aPercent;
            });
        };

        // 解析单个时间字符串（支持 YYYY / YYYY-MM / YYYY-MM-DD）
        const parseSingleTime = (timeStr: string): {
            type: 'year' | 'month' | 'date';
            value: string;
            year: number;
            month?: number;
            day?: number;
        } => {
            const normalized = timeStr.replace(/\//g, "-").trim();
            // 纯年份 YYYY
            if (/^\d{4}$/.test(normalized)) {
                const year = Number(normalized);
                return {
                    type: 'year',
                    value: normalized,
                    year
                };
            }
            // 年月 YYYY-MM
            else if (/^\d{4}-\d{2}$/.test(normalized)) {
                const [year, month] = normalized.split("-").map(Number);
                return {
                    type: 'month',
                    value: normalized,
                    year,
                    month
                };
            }
            // 日期 YYYY-MM-DD
            else if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
                const [year, month, day] = normalized.split("-").map(Number);
                return {
                    type: 'date',
                    value: normalized,
                    year,
                    month,
                    day
                };
            }
            // 默认当前年月
            const now = new Date();
            return {
                type: 'month',
                value: `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`,
                year: now.getFullYear(),
                month: now.getMonth() + 1
            };
        };

        // 格式化时间为中文显示（年/年月/年月日）
        const formatTimeToCN = (parsedTime: ReturnType<typeof parseSingleTime>): string => {
            if (parsedTime.type === 'year') {
                return `${parsedTime.year}年`;
            } else if (parsedTime.type === 'month') {
                const monthStr = parsedTime.month!.toString().padStart(2, '0');
                return `${parsedTime.year}年${monthStr}月`;
            } else {
                const monthStr = parsedTime.month!.toString().padStart(2, '0');
                const dayStr = parsedTime.day!.toString().padStart(2, '0');
                return `${parsedTime.year}年${monthStr}月${dayStr}日`;
            }
        };

        // 生成时间范围字符串（合并start/end为单个字段）
        const generateTimeRange = (startParsed: ReturnType<typeof parseSingleTime>, endParsed?: ReturnType<typeof parseSingleTime>): string => {
            const startCN = formatTimeToCN(startParsed);
            // 未传end_time 或 start/end相同
            if (!endParsed || startParsed.value === endParsed.value) {
                return startCN;
            }
            // 传了不同的end_time，生成区间格式
            const endCN = formatTimeToCN(endParsed);
            return `${startCN} ~ ${endCN}`;
        };

        // 生成时间维度对应的X轴数据（核心优化：确保无数据时也返回完整的维度数组）
        const generateXData = (start: ReturnType<typeof parseSingleTime>, end: ReturnType<typeof parseSingleTime>): number[] => {
            // 场景1：年维度（start/end都是年份）
            if (start.type === 'year' && end.type === 'year') {
                return Array.from({ length: 12 }, (_, i) => i + 1); // [1,2,...12] 月份
            }

            // 场景2：年月区间（如 2025-10 ~ 2025-12）
            if ((start.type === 'month' || start.type === 'year') && (end.type === 'month' || end.type === 'year')) {
                const startYear = start.year;
                const startMonth = start.type === 'year' ? 1 : start.month!;
                const endYear = end.year;
                const endMonth = end.type === 'year' ? 12 : end.month!;

                const days: number[] = [];
                // 遍历每个月，收集所有天数
                for (let year = startYear; year <= endYear; year++) {
                    const currentStartMonth = year === startYear ? startMonth : 1;
                    const currentEndMonth = year === endYear ? endMonth : 12;

                    for (let month = currentStartMonth; month <= currentEndMonth; month++) {
                        const lastDay = new Date(year, month, 0).getDate();
                        // 收集该月所有天数（如10月：1-31）
                        const monthDays = Array.from({ length: lastDay }, (_, i) => i + 1);
                        days.push(...monthDays);
                    }
                }
                return days;
            }

            // 场景3：日期区间（如 2025-12-10 ~ 2025-12-12）
            if (start.type === 'date' && end.type === 'date') {
                const startDate = new Date(start.year, start.month! - 1, start.day!);
                const endDate = new Date(end.year, end.month! - 1, end.day!);
                const days: number[] = [];
                const current = new Date(startDate);
                while (current <= endDate) {
                    days.push(current.getDate());
                    current.setDate(current.getDate() + 1);
                }
                return days;
            }

            // 场景4：单日期/单年月（兜底返回完整维度）
            if (start.type === 'date') {
                return [start.day!];
            } else if (start.type === 'month') {
                const lastDay = new Date(start.year, start.month!, 0).getDate();
                return Array.from({ length: lastDay }, (_, i) => i + 1); // 1~当月最后一天
            } else {
                return Array.from({ length: 12 }, (_, i) => i + 1); // 1~12月
            }
        };

        // 构建时间查询条件
        const buildTimeCondition = (start: ReturnType<typeof parseSingleTime>, end: ReturnType<typeof parseSingleTime>): {
            condition: string;
            params: any[];
        } => {
            // 年维度
            if (start.type === 'year' && end.type === 'year') {
                return {
                    condition: "DATE_FORMAT(b.bill_time, '%Y') BETWEEN ? AND ?",
                    params: [start.value, end.value]
                };
            }

            // 年月维度
            if ((start.type === 'month' || start.type === 'year') && (end.type === 'month' || end.type === 'year')) {
                const startMonthStr = start.type === 'year' ? `${start.year}-01` : start.value;
                const endMonthStr = end.type === 'year' ? `${end.year}-12` : end.value;
                return {
                    condition: "DATE_FORMAT(b.bill_time, '%Y-%m') BETWEEN ? AND ?",
                    params: [startMonthStr, endMonthStr]
                };
            }

            // 日期维度
            if (start.type === 'date' && end.type === 'date') {
                return {
                    condition: "DATE(b.bill_time) BETWEEN ? AND ?",
                    params: [start.value, end.value]
                };
            }

            // 单值兜底
            if (start.type === 'year') {
                return {
                    condition: "DATE_FORMAT(b.bill_time, '%Y') = ?",
                    params: [start.value]
                };
            } else if (start.type === 'month') {
                return {
                    condition: "DATE_FORMAT(b.bill_time, '%Y-%m') = ?",
                    params: [start.value]
                };
            } else {
                return {
                    condition: "DATE(b.bill_time) = ?",
                    params: [start.value]
                };
            }
        };

        // 格式化日期字符串（适配年/月/日维度）
        const formatDateStr = (time: ReturnType<typeof parseSingleTime>, day?: number): {
            date: string;
            dateStr: string;
        } => {
            if (time.type === 'year') {
                // 年维度：date=YYYY-MM，dateStr=YYYY年MM月
                const month = day || 1;
                const monthStr = month.toString().padStart(2, '0');
                return {
                    date: `${time.year}-${monthStr}`,
                    dateStr: `${time.year}年${month}月`
                };
            } else if (time.type === 'month') {
                // 年月维度：date=YYYY-MM-DD，dateStr=YYYY年MM月DD日
                const dayStr = (day || 1).toString().padStart(2, '0');
                const monthStr = time.month!.toString().padStart(2, '0');
                return {
                    date: `${time.year}-${monthStr}-${dayStr}`,
                    dateStr: `${time.year}年${time.month}月${day || 1}日`
                };
            } else {
                // 日期维度
                return {
                    date: time.value,
                    dateStr: formatDateToCN(time.value)
                };
            }
        };

        // 日期转中文格式
        const formatDateToCN = (dateStr: string) => {
            if (!dateStr) return "";
            const normalized = dateStr.replace(/[-/.]/g, "-");
            const parts = normalized.split("-");
            if (parts.length === 2) {
                return `${parts[0]}年${parts[1]}月`;
            } else if (parts.length === 3) {
                return `${parts[0]}年${parts[1]}月${parts[2]}日`;
            } else if (parts.length === 1) {
                return `${parts[0]}年`;
            }
            return dateStr;
        };

        // 生成空数据的lineList（参数缺失/异常时使用）
        const generateEmptyLineList = (xData: number[], startParsed: ReturnType<typeof parseSingleTime>, timeRange: string) => {
            return []; // 无数据时list直接返回空数组
        };

        // 1. 基础参数校验
        if (!userId || !start_time) {
            console.warn("calendarMonthChart 参数缺失：", { userId, start_time });
            // 参数缺失时，生成当前年月的空数据
            const now = new Date();
            const defaultTimeStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
            const defaultParsed = parseSingleTime(defaultTimeStr);
            const xData = generateXData(defaultParsed, defaultParsed);
            const timeRange = formatTimeToCN(defaultParsed);
            return {
                chartData: {
                    lineData: {
                        xData,
                        xAxisData: xData.map(() => "0.00"), // 全0金额
                        summary: {
                            totalCount: 0,
                            totalAmount: "0.00",
                            timeRange
                        },
                        list: [], // 无数据返回空
                    },
                    PieData: {
                        summary: {
                            totalCategory: 0,
                            totalAmount: "0.00",
                            type: "结余",
                            timeRange
                        },
                        list: [],
                    },
                },
            };
        }

        try {
            // 2. 解析时间参数
            const startParsed = parseSingleTime(start_time);
            let endParsed: ReturnType<typeof parseSingleTime> | undefined;
            const hasEndTime = !!end_time;

            if (hasEndTime) {
                endParsed = parseSingleTime(end_time!);
                // 确保结束时间不早于开始时间
                const getTimeStamp = (parsed: ReturnType<typeof parseSingleTime>): number => {
                    if (parsed.type === 'year') return new Date(parsed.year, 0, 1).getTime();
                    if (parsed.type === 'month') return new Date(parsed.year, parsed.month! - 1, 1).getTime();
                    return new Date(parsed.year, parsed.month! - 1, parsed.day!).getTime();
                };
                if (endParsed && getTimeStamp(endParsed) < getTimeStamp(startParsed)) {
                    console.warn("end_time 早于 start_time，自动修正为同一时间");
                    endParsed = startParsed;
                }
            } else {
                endParsed = startParsed;
            }

            // 生成统一的时间范围字符串
            const timeRange = generateTimeRange(startParsed, hasEndTime ? endParsed : undefined);

            // 3. 生成X轴数据（确保无数据时也有完整维度）
            const xData = generateXData(startParsed, endParsed!);
            const initXAxisData = xData.map(() => "0.00"); // 初始化为全0

            // 4. 构建时间条件
            const { condition: timeCondition, params: timeParams } = buildTimeCondition(startParsed, endParsed!);

            // 5. 构建账本条件
            let bookCondition = "";
            const bookParams: any[] = [];
            if (bookId && bookId > 0) {
                bookCondition = "AND b.book_id = ?";
                bookParams.push(bookId);
            }

            // 6. 动态调整查询粒度（年维度按月份分组，其他按日期分组）
            const groupByField = startParsed.type === 'year'
                ? "MONTH(b.bill_time), DATE_FORMAT(b.bill_time, '%Y-%m')"
                : "DAY(b.bill_time), DATE_FORMAT(b.bill_time, '%Y-%m-%d')";
            const selectField = startParsed.type === 'year'
                ? "MONTH(b.bill_time) AS day"
                : "DAY(b.bill_time) AS day";
            const dateFormatField = startParsed.type === 'year'
                ? "DATE_FORMAT(b.bill_time, '%Y-%m') AS date"
                : "DATE_FORMAT(b.bill_time, '%Y-%m-%d') AS date";

            // 7. 查询折线图数据
            const lineSql = `
                SELECT
                    ${selectField},
                    ${dateFormatField},
                    MAX(b.bill_time) AS latest_bill_time,
                    SUM(CASE WHEN b.type = '1' THEN b.amount ELSE 0 END) AS income,
                    SUM(CASE WHEN b.type = '2' THEN b.amount ELSE 0 END) AS expense,
                    COUNT(CASE WHEN b.type = '1' THEN 1 END) AS incomeCount,
                    COUNT(CASE WHEN b.type = '2' THEN 1 END) AS expenseCount,
                    COUNT(*) AS totalCount
                FROM ${this.billTableName} b
                WHERE b.user_id = ?
                  AND ${timeCondition}
                  AND b.is_deleted = 0
                    ${bookCondition}
                GROUP BY ${groupByField}
                ORDER BY latest_bill_time DESC
            `;
            const lineParams = [userId, ...timeParams, ...bookParams];
            const [lineRows] = await pool.execute(lineSql, lineParams);

            // 8. 构建数据映射
            const dataMap = new Map<
                number,
                {
                    date: string;
                    bill_time: string;
                    income: string;
                    expense: string;
                    incomeCount: number;
                    expenseCount: number;
                    totalCount: number;
                }
            >();

            (lineRows as any[]).forEach((item) => {
                const day = Number(item.day);
                const date = item.date || formatDateStr(startParsed, day).date;
                const bill_time = safeTimeToString(item.latest_bill_time) || date;
                const income = formatAmount(item.income);
                const expense = formatAmount(item.expense);
                const incomeCount = Number(item.incomeCount) || 0;
                const expenseCount = Number(item.expenseCount) || 0;
                const totalCount = Number(item.totalCount) || 0;

                dataMap.set(day, {
                    date,
                    bill_time,
                    income,
                    expense,
                    incomeCount,
                    expenseCount,
                    totalCount,
                });
            });

            // 9. 统计总额和笔数
            let lineTotalIncomeNum = 0;
            let lineTotalExpenseNum = 0;
            let lineTotalBalanceNum = 0;
            let lineTotalIncomeCount = 0;
            let lineTotalExpenseCount = 0;
            let lineTotalBalanceCount = 0;

            xData.forEach((day) => {
                const dayData = dataMap.get(day) || {
                    income: "0.00",
                    expense: "0.00",
                    incomeCount: 0,
                    expenseCount: 0,
                    totalCount: 0,
                };

                const dayIncomeNum = Number(dayData.income);
                const dayExpenseNum = Number(dayData.expense);

                lineTotalIncomeNum += dayIncomeNum;
                lineTotalExpenseNum += dayExpenseNum;
                lineTotalBalanceNum += (dayIncomeNum - dayExpenseNum);

                lineTotalIncomeCount += dayData.incomeCount;
                lineTotalExpenseCount += dayData.expenseCount;
                lineTotalBalanceCount += (dayData.incomeCount + dayData.expenseCount);
            });

            // 根据type确定统计值
            let lineTotalAmountNum = 0;
            let lineTotalCount = 0;
            switch (type) {
                case 1:
                    lineTotalAmountNum = lineTotalIncomeNum;
                    lineTotalCount = lineTotalIncomeCount;
                    break;
                case 2:
                    lineTotalAmountNum = lineTotalExpenseNum;
                    lineTotalCount = lineTotalExpenseCount;
                    break;
                case 100:
                    lineTotalAmountNum = lineTotalBalanceNum;
                    lineTotalCount = lineTotalBalanceCount;
                    break;
            }

            // 10. 收集数据并计算最高金额
            const tempAllData: Array<{
                day: number;
                date: string;
                dateStr: string;
                bill_time: string;
                amountNum: number;
                amountStr: string;
                count: number;
            }> = [];

            const xAxisData: string[] = [];
            xData.forEach((day) => {
                const { date: defaultDate, dateStr: defaultDateStr } = formatDateStr(startParsed, day);
                const defaultBillTime = defaultDate + "T00:00:00.000Z";

                const dayData = dataMap.get(day) || {
                    date: defaultDate,
                    bill_time: defaultBillTime,
                    income: "0.00",
                    expense: "0.00",
                    incomeCount: 0,
                    expenseCount: 0,
                    totalCount: 0,
                };

                let amountNum = 0;
                let count = 0;
                switch (type) {
                    case 1:
                        amountNum = Number(dayData.income);
                        count = dayData.incomeCount;
                        break;
                    case 2:
                        amountNum = Number(dayData.expense);
                        count = dayData.expenseCount;
                        break;
                    case 100:
                        amountNum = Number(dayData.income) - Number(dayData.expense);
                        count = dayData.incomeCount + dayData.expenseCount;
                        break;
                }
                const amountStr = formatAmount(amountNum);
                xAxisData.push(amountStr);

                tempAllData.push({
                    day,
                    date: dayData.date,
                    dateStr: formatDateToCN(dayData.date),
                    bill_time: dayData.bill_time,
                    amountNum,
                    amountStr,
                    count,
                });
            });

            // 计算最高金额（取绝对值）
            const validAmounts = tempAllData
                .map((item) => Math.abs(item.amountNum))
                .filter((num) => num > 0);
            const maxAmount = validAmounts.length > 0 ? Math.max(...validAmounts) : 0;

            // 11. 生成折线图list（核心修改：只保留金额≠0的条目）
            const lineList: Array<{
                day: number;
                date: string;
                dateStr: string;
                amount: string;
                count: number;
                ratio: number;
                ratioPercent: string;
            }> = [];

            tempAllData.forEach((item) => {
                // 核心过滤条件：只保留金额≠0的条目
                if (item.amountNum === 0) return;

                let ratio = 0;
                let ratioPercent = "0.00%";

                if (maxAmount > 0) {
                    ratio = Number((Math.abs(item.amountNum) / maxAmount).toFixed(4));
                    ratioPercent = `${(ratio * 100).toFixed(2)}`;
                }

                lineList.push({
                    day: item.day,
                    date: item.date,
                    dateStr: item.dateStr,
                    amount: item.amountStr,
                    count: item.count,
                    ratio: ratio,
                    ratioPercent: ratioPercent,
                });
            });

            // 排序（按时间升序）
            lineList.sort((a, b) => b.day - a.day);

            // 折线图汇总（使用统一的timeRange）
            const lineSummary = {
                totalCount: lineTotalCount,
                totalAmount: formatAmount(lineTotalAmountNum),
                timeRange
            };

            // 12. 饼图数据处理
            let pieSummary = {
                totalCategory: 0,
                totalAmount: "0.00",
                type: type === 1 ? "收入" : type === 2 ? "支出" : "结余",
                timeRange // 复用统一的时间范围
            };
            let pieList: Array<{
                categoryId: number | null;
                name: string;
                icon: string;
                value: string | number;
                count: number;
                ratio: number;
                ratioPercent: string;
                type: string;
            }> = [];

            // 封装饼图查询函数
            const queryPieData = async (pieType: string) => {
                const pieSql = `
                    SELECT
                        IFNULL(c.id, NULL) AS categoryId,
                        IFNULL(c.icon,'') AS categoryIcon,
                        IFNULL(c.name, '未分类') AS categoryName,
                        COALESCE(SUM(b.amount), 0) AS amount,
                        COUNT(*) AS categoryCount
                    FROM ${this.billTableName} b
                             LEFT JOIN mate_category c ON b.category_id = c.id
                    WHERE b.user_id = ?
                      AND ${timeCondition}
                      AND b.is_deleted = 0
                      AND b.type = ?
                        ${bookCondition}
                    GROUP BY c.id, c.name, c.icon
                    ORDER BY amount DESC
                `;
                const pieParams = [userId, ...timeParams, pieType, ...bookParams];
                const [pieRows] = await pool.execute(pieSql, pieParams);
                const rawList = (pieRows as any[])
                    .map((item) => ({
                        categoryId: item.categoryId ? Number(item.categoryId) : null,
                        categoryIcon: item.categoryIcon || "",
                        categoryName: item.categoryName || "未分类",
                        amount: Number(item.amount) || 0,
                        count: Number(item.categoryCount) || 0,
                    }))
                    .filter((item) => item.amount > 0); // 饼图也只保留有金额的分类

                const totalAmount = rawList.reduce((sum, item) => sum + item.amount, 0);
                const list = rawList.map((item) => {
                    const ratio = totalAmount > 0 ? Number((item.amount / totalAmount).toFixed(4)) : 0;
                    const ratioPercent = totalAmount > 0 ? `${(ratio * 100).toFixed(2)}` : "0.00";
                    return {
                        categoryId: item.categoryId,
                        name: item.categoryName,
                        icon: item.categoryIcon,
                        value: formatAmount(item.amount),
                        count: item.count,
                        ratio: ratio,
                        ratioPercent: ratioPercent,
                        type: pieType === "1" ? "收入" : "支出",
                    };
                });

                return {
                    totalCategory: list.length,
                    totalAmount: formatAmount(totalAmount),
                    list: sortPieDataByPercent(list),
                };
            };

            if (type === 1) {
                const incomePie = await queryPieData("1");
                pieSummary.totalCategory = incomePie.totalCategory;
                pieSummary.totalAmount = incomePie.totalAmount;
                pieSummary.type = "收入";
                pieList = incomePie.list;
            } else if (type === 2) {
                const expensePie = await queryPieData("2");
                pieSummary.totalCategory = expensePie.totalCategory;
                pieSummary.totalAmount = expensePie.totalAmount;
                pieSummary.type = "支出";
                pieList = expensePie.list;
            } else {
                const incomePie = await queryPieData("1");
                const expensePie = await queryPieData("2");
                const mergeList = [
                    ...incomePie.list.map((item) => ({ ...item, name: `收入-${item.name}` })),
                    ...expensePie.list.map((item) => ({ ...item, name: `支出-${item.name}` })),
                ];
                pieList = sortPieDataByPercent(mergeList);
                pieSummary.totalCategory = incomePie.totalCategory + expensePie.totalCategory;
                pieSummary.totalAmount = formatAmount(lineTotalBalanceNum);
                pieSummary.type = "结余";
            }

            // 13. 返回最终结果
            return {
                chartData: {
                    lineData: {
                        xData, // 完整维度（如1-31天）
                        xAxisData, // 完整金额（含0值）
                        summary: lineSummary,
                        list: lineList, // 只含金额≠0的条目
                    },
                    PieData: {
                        summary: pieSummary,
                        list: pieList,
                    },
                },
            };
        } catch (error: any) {
            console.error("calendarMonthChart 查询失败：", {
                userId,
                bookId,
                start_time,
                end_time,
                type,
                error: error.message,
                stack: error.stack,
            });
            // 异常场景：返回完整轴数据，list为空
            const startParsed = parseSingleTime(start_time);
            const endParsed = !!end_time ? parseSingleTime(end_time!) : startParsed;
            const timeRange = generateTimeRange(startParsed, endParsed);
            const xData = generateXData(startParsed, endParsed);
            const pieTypeText = type === 1 ? "收入" : type === 2 ? "支出" : "结余";

            return {
                chartData: {
                    lineData: {
                        xData, // 完整的维度数组
                        xAxisData: xData.map(() => "0.00"), // 全0金额
                        summary: {
                            totalCount: 0,
                            totalAmount: "0.00",
                            timeRange
                        },
                        list: [], // 异常时list返回空
                    },
                    PieData: {
                        summary: {
                            totalCategory: 0,
                            totalAmount: "0.00",
                            type: pieTypeText,
                            timeRange
                        },
                        list: [],
                    },
                },
            };
        }
    }
  // 保留生成当月日期的工具方法（需放在类中）
  private generateMonthDays(year: number, month: number): string[] {
    const days: string[] = [];
    // 获取当月最后一天
    const lastDay = new Date(year, month, 0).getDate();
    for (let i = 1; i <= lastDay; i++) {
      days.push(i.toString().padStart(2, "0")); // 格式化为 01,02...31
    }
    return days;
  }
}

export default new CalendarModule();
