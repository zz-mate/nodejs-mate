import pool from '../../db';
import {formatAmount,parseJsonToArray} from '../../utils/tools'

class CalendarModule {

    billTableName = 'mate_bill';

    async calendarMonth(userId: number,bookId: number,start_time: string): Promise<{dailyList: {year:string,month:string;day: string;income: string;expense: string;}[]}> {
        // 1. 基础参数校验
        if (!userId || !start_time) {
            console.warn('calendarMonth 参数缺失：', { userId, start_time });
            return {
                dailyList: []
            };
        }

        // 初始化每日收支列表
        let dailyList: { year:string,month:string;day: string; income: string; expense: string }[] = [];

        try {
            // 构建时间条件和查询参数
            let timeCondition = '';
            const baseParams: any[] = [userId];
            let isMonthQuery = false; // 标记是否为整月查询
            let queryYear = '';
            let queryMonth = '';

            // 匹配 YYYY-MM-DD（精确到日）
            if (start_time.match(/^\d{4}-\d{2}-\d{2}$/)) {
                timeCondition = 'DATE(b.bill_time) = ?';
                baseParams.push(start_time);
                // 单日查询时，dailyList 只返回当天数据
                const year = start_time.split('-')[0];
                const month = start_time.split('-')[1];
                const day = start_time.split('-')[2];
                dailyList = [{ day,year,month, income: "0.00", expense: "0.00" }];
            }
            // 匹配 YYYY-MM（查询整月）
            else if (start_time.match(/^\d{4}-\d{2}$/)) {
                isMonthQuery = true;
                timeCondition = 'DATE_FORMAT(b.bill_time, "%Y-%m") = ?';
                baseParams.push(start_time);
                // 解析年月，用于生成每日日期
                [queryYear, queryMonth] = start_time.split('-');
            }
            // 日期格式错误
            else {
                console.warn('日期格式错误，支持 YYYY-MM-DD 或 YYYY-MM：', start_time);
                return {
                    dailyList: []
                };
            }

            // 构建 WHERE 条件（补充 bookId 筛选）
            const whereConditions = [
                'b.user_id = ?',
                timeCondition,
                'b.is_deleted = 0'
            ];
            if (bookId) {
                whereConditions.push('b.book_id = ?');
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
                WHERE ${whereConditions.join(' AND ')}
                GROUP BY DATE_FORMAT(b.bill_time, '%d')
                ORDER BY day ASC
            `;
                const [dailyResult] = await pool.execute(dailySql, baseParams);
                // 转换为键值对，方便补全日期
                const dailyMap = new Map<string, { income: string; expense: string }>();
                (dailyResult as any[]).forEach(item => {
                    dailyMap.set(item.day, {
                        income: formatAmount(item.income) as string,
                        expense: formatAmount(item.expense) as string,
                    });
                });

                // 生成当月所有日期，补全无数据的日期（收入支出为0.00）
                const allDays = this.generateMonthDays(Number(queryYear), Number(queryMonth));
                dailyList = allDays.map(day => ({
                    year:queryYear,
                    month:queryMonth,
                    day,
                    income: dailyMap.get(day)?.income || "0.00",
                    expense: dailyMap.get(day)?.expense || "0.00"
                }));
            }


            // 返回精简结果
            return {
                dailyList
            };

        } catch (error: any) {
            console.error('calendarMonth 查询失败：', {
                userId,
                bookId,
                start_time,
                error: error.message,
                stack: error.stack
            });
            return {
                dailyList: []
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
            console.warn('calendarDate 参数缺失：', { userId: userIdNum, start_time });
            return {
                list: [],
                total: 0,
                page: 1,
                pageSize: 20,
                totalIncome: "0.00",
                totalExpense: "0.00"
            };
        }

        // 2. 分页参数处理（防非法值）
        const validPageNum = Math.max(1, isNaN(pageNum) ? 1 : pageNum);
        const validPageSize = Math.min(100, Math.max(1, isNaN(pageSizeNum) ? 20 : pageSizeNum));
        const offset = (validPageNum - 1) * validPageSize;

        try {
            // 3. 构建时间条件（新增支持 YYYY-MM 格式）
            let timeCondition = '';
            const baseParams: any[] = [userIdNum];

            // 格式1：YYYY-MM（整月查询）
            if (start_time.match(/^\d{4}-\d{2}$/)) {
                timeCondition = 'DATE_FORMAT(b.bill_time, "%Y-%m") = ?';
                baseParams.push(start_time);
            }
            // 格式2：YYYY-MM-DD（单日查询）
            else if (start_time.match(/^\d{4}-\d{2}-\d{2}$/)) {
                timeCondition = 'DATE(b.bill_time) = ?';
                baseParams.push(start_time);
            }
            // 格式3：YYYY-MM-DD~YYYY-MM-DD（日期范围查询）
            else if (start_time.match(/^\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}$/)) {
                const [startDate, endDate] = start_time.split('~');
                timeCondition = 'DATE(b.bill_time) BETWEEN ? AND ?';
                baseParams.push(startDate, endDate);
            }
            // 日期格式错误
            else {
                console.warn('日期格式错误，支持 YYYY-MM / YYYY-MM-DD 或 YYYY-MM-DD~YYYY-MM-DD：', start_time);
                return {
                    list: [],
                    total: 0,
                    page: validPageNum,
                    pageSize: validPageSize,
                    totalIncome: "0.00",
                    totalExpense: "0.00"
                };
            }

            // 4. 构建 WHERE 条件（包含账本+分类+收支类型筛选）
            const whereConditions = [
                'b.user_id = ?',
                timeCondition,
                'b.is_deleted = 0'
            ];

            // 账本筛选（转换后校验）
            if (bookIdNum && bookIdNum > 0) {
                whereConditions.push('b.book_id = ?');
                baseParams.push(bookIdNum);
            }

            // 分类筛选（转换后校验）
            if (categoryIdNum !== null && categoryIdNum > 0) {
                whereConditions.push('b.category_id = ?');
                baseParams.push(categoryIdNum);
            }

            // 新增：收支类型筛选（1=收入，2=支出，100=结余（不筛选，汇总时计算））
            if (typeNum === 1) {
                whereConditions.push('b.type = ?');
                baseParams.push('1'); // 收入
            } else if (typeNum === 2) {
                whereConditions.push('b.type = ?');
                baseParams.push('2'); // 支出
            }
            // type=100（结余）：不筛选类型，同时查收入+支出

            // 5. 查询总条数 + 总收入/总支出（一次查询提升性能）
            const countAndSumSql = `
            SELECT
                COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN b.type = '1' THEN b.amount ELSE 0 END), 0) AS totalIncome,
                COALESCE(SUM(CASE WHEN b.type = '2' THEN b.amount ELSE 0 END), 0) AS totalExpense
            FROM ${this.billTableName} b
            WHERE ${whereConditions.join(' AND ')}
        `;
            const [countSumResult] = await pool.execute(countAndSumSql, baseParams);
            const total = (countSumResult as any[])[0]?.total || 0;
            const totalIncomeNum = Number((countSumResult as any[])[0]?.totalIncome) || 0;
            const totalExpenseNum = Number((countSumResult as any[])[0]?.totalExpense) || 0;

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
            WHERE ${whereConditions.join(' AND ')}
            ORDER BY b.bill_time DESC
            LIMIT ?, ?
        `;

            // 拼接分页参数（数字类型，避免字符串转换问题）
            const queryParams = [...baseParams, offset.toString(), validPageSize.toString()];
            const [listRows] = await pool.execute(listSql, queryParams);

            // 7. 格式化账单列表（分类/账本封装为对象）
            const formattedRows = (listRows as any[]).map(item => ({
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
                // 分类信息（空值返回空对象）
                category: item.c_id ? {
                    id: item.c_id,
                    name: item.c_name,
                    icon: item.c_icon,
                    type: item.c_type
                } : {},
                // 账本信息（空值返回空对象）
                book: item.bo_id ? {
                    id: item.bo_id,
                    name: item.bo_name,
                    is_default: item.bo_is_default
                } : {}
            }));

            // 8. 返回结构化结果（type=100时新增totalBalance）
            const result = {
                list: formattedRows,
                total,
                page: validPageNum,
                pageSize: validPageSize,
                totalIncome,
                totalExpense
            };
            // 仅type=100时返回结余字段
            if (typeNum === 100) {
                (result as any).totalBalance = totalBalance;
            }

            return result;

        } catch (error: any) {
            console.error('calendarDate 查询失败：', {
                userId: userIdNum,
                bookId: bookIdNum,
                start_time,
                page: validPageNum,
                pageSize: validPageSize,
                category_id: categoryIdNum,
                type: typeNum,
                error: error.message,
                stack: error.stack
            });
            // 异常返回基础结构，type=100时补充结余
            const baseResult = {
                list: [],
                total: 0,
                page: validPageNum,
                pageSize: validPageSize,
                totalIncome: "0.00",
                totalExpense: "0.00"
            };
            if (typeNum === 100) {
                (baseResult as any).totalBalance = "0.00";
            }
            return baseResult;
        }
    }





    /**
     * 日历月维度图表数据查询（修复结余+按最高金额计算占比+结余饼图+饼图按百分比排序）
     * @param userId 用户ID（必传）
     * @param bookId 账本ID（0 表示查询所有账本）
     * @param start_time 时间范围（支持 YYYY-MM 或 YYYY-MM-DD）
     * @param type 数据类型：1=收入，2=支出，100=结余（默认100）
     * @returns 适配图表渲染的结构化数据
     */
    async calendarMonthChart(
        userId: number,
        bookId: number,
        start_time: string,
        type: 1 | 2 | 100 = 100
    ): Promise<{
        chartData: {
            lineData: {
                xData: number[];       // 当月日期数字 [1,2,3...31]
                xAxisData: string[];   // 对应日期金额，无数据为0
                summary: {             // 折线图汇总
                    totalCount: number;// 总笔数（仅统计当前type对应的账单数）
                    totalAmount: string|number;// 总收入/支出/结余（当月总计）
                };
                list: Array<{          // 替换detail为list，新增date+百分比字段
                    day: number;       // 日期数字（1-31）
                    date: string;      // 完整日期 YYYY-MM-DD
                    amount: string;    // 当日金额（收入/支出/结余）
                    count: number;     // 当日笔数（仅当前type对应的笔数）
                    ratio: number;     // 当日金额占最高金额比例（0-1）
                    ratioPercent: string; // 当日金额占比百分比（基于最高金额）
                }>;
            };
            PieData: {
                summary: {            // 饼图汇总
                    totalCategory: number; // 分类总数
                    totalAmount: string|number;   // 分类总金额（与lineData的totalAmount一致）
                    type: string;      // 收支类型："收入" | "支出" | "结余"
                };
                list: Array<{         // 替换detail为list，补充分类ID+百分比+图标
                    categoryId: number | null; // 分类ID（无分类为null）
                    name: string;     // 分类名称
                    icon: string;     // 分类图标
                    value: string|number;           // 分类金额
                    count: number;            // 该分类下的账单笔数
                    ratio: number;            // 占比（0-1）
                    ratioPercent: string;     // 占比百分比（如 "66.67"）
                    type: string;             // 收支类型："收入" | "支出"
                }>;
            };
        };
    }> {
        // 补全缺失的金额格式化函数
        const formatAmount = (amount: any): string => {
            if (amount === null || amount === undefined || amount === '') return "0.00";
            // 转换为数字后保留2位小数（支持负数，适配结余）
            const num = Number(amount);
            return isNaN(num) ? "0.00" : num.toFixed(2);
        };

        // 新增：安全转换为时间字符串的工具函数
        const safeTimeToString = (time: any): string => {
            if (typeof time === 'string') return time.trim();
            if (time instanceof Date) return time.toISOString();
            if (time === null || time === undefined) return '';
            if (typeof time === 'number') {
                return new Date(time).toISOString();
            }
            return String(time).trim();
        };

        // 新增：安全的时间比较函数
        const compareTimeDesc = (aTime: any, bTime: any): number => {
            const timeA = safeTimeToString(aTime) || '1970-01-01T00:00:00.000Z';
            const timeB = safeTimeToString(bTime) || '1970-01-01T00:00:00.000Z';
            return timeB.localeCompare(timeA);
        };

        // 新增：饼图数据按百分比降序排序的工具函数
        const sortPieDataByPercent = (list: any[]) => {
            return list.sort((a, b) => {
                // 将百分比字符串转为数字（如 "66.67%" → 66.67）
                const aPercent = Number(a.ratioPercent.replace('%', ''));
                const bPercent = Number(b.ratioPercent.replace('%', ''));
                // 降序排序（大的在前）
                return bPercent - aPercent;
            });
        };

        // 1. 基础参数校验
        if (!userId || !start_time) {
            console.warn('calendarMonthChart 参数缺失：', { userId, start_time });
            return {
                chartData: {
                    lineData: {
                        xData: [],
                        xAxisData: [],
                        summary: { totalCount: 0, totalAmount: "0.00" },
                        list: []
                    },
                    PieData: {
                        summary: { totalCategory: 0, totalAmount: "0.00", type: "结余" },
                        list: []
                    }
                }
            };
        }

        // 工具函数：生成指定年月的所有日期数字
        const getMonthDays = (year: number, month: number): number[] => {
            const lastDay = new Date(year, month, 0).getDate();
            return Array.from({ length: lastDay }, (_, i) => i + 1);
        };

        // 工具函数：解析日期字符串为年/月
        const parseDateStr = (dateStr: string): { year: number; month: number } => {
            const normalized = dateStr.replace(/\//g, '-');
            if (normalized.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const [year, month] = normalized.split('-').map(Number);
                return { year, month };
            } else if (normalized.match(/^\d{4}-\d{2}$/)) {
                const [year, month] = normalized.split('-').map(Number);
                return { year, month };
            }
            return { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
        };

        // 工具函数：生成YYYY-MM-DD格式日期
        const formatDate = (year: number, month: number, day: number): string => {
            const m = month.toString().padStart(2, '0');
            const d = day.toString().padStart(2, '0');
            return `${year}-${m}-${d}`;
        };

        try {
            // 2. 解析时间，生成xData和初始化数据
            const { year, month } = parseDateStr(start_time);
            const xData = getMonthDays(year, month);
            const initXAxisData = xData.map(() => "0.00");

            // 3. 统一日期格式，构建时间条件
            const normalizedDate = start_time.replace(/\//g, '-');
            let timeCondition = '';
            const baseParams: any[] = [userId];

            if (normalizedDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                timeCondition = 'DATE(b.bill_time) = ?';
                baseParams.push(normalizedDate);
            } else if (normalizedDate.match(/^\d{4}-\d{2}$/)) {
                timeCondition = 'DATE_FORMAT(b.bill_time, "%Y-%m") = ?';
                baseParams.push(normalizedDate);
            } else {
                console.warn('日期格式错误，支持 YYYY-MM-DD 或 YYYY-MM：', start_time);
                return {
                    chartData: {
                        lineData: {
                            xData,
                            xAxisData: initXAxisData,
                            summary: { totalCount: 0, totalAmount: "0.00" },
                            list: []
                        },
                        PieData: {
                            summary: {
                                totalCategory: 0,
                                totalAmount: "0.00",
                                type: "结余"
                            },
                            list: []
                        }
                    }
                };
            }

            // 4. 构建账本条件
            let bookCondition = '';
            const queryParams = [...baseParams];
            if (bookId && bookId > 0) {
                bookCondition = 'AND b.book_id = ?';
                queryParams.push(bookId);
            }

            // 5. 查询折线图+每日明细数据（按type过滤笔数）
            const lineSql = `
                SELECT
                    DAY(b.bill_time) AS day,
                    DATE_FORMAT(b.bill_time, '%Y-%m-%d') AS date,
                    -- DATE_FORMAT(b.bill_time, '%H:%i') AS bill_time,
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
                GROUP BY DAY(b.bill_time), DATE_FORMAT(b.bill_time, '%Y-%m-%d')
                ORDER BY latest_bill_time DESC
            `;
            const [lineRows] = await pool.execute(lineSql, queryParams);
            console.log('lineRows:', lineRows);

            // 构建日期映射（含bill_time，确保为字符串）
            const dayMap = new Map<number, {
                date: string;
                bill_time: string;
                income: string;
                expense: string;
                incomeCount: number;
                expenseCount: number;
                totalCount: number;
            }>();

            (lineRows as any[]).forEach(item => {
                const day = Number(item.day);
                const date = item.date || formatDate(year, month, day);
                const bill_time = safeTimeToString(item.latest_bill_time) || date;
                const income = formatAmount(item.income);
                const expense = formatAmount(item.expense);
                const incomeCount = Number(item.incomeCount) || 0;
                const expenseCount = Number(item.expenseCount) || 0;
                const totalCount = Number(item.totalCount) || 0;

                dayMap.set(day, {
                    date,
                    bill_time,
                    income,
                    expense,
                    incomeCount,
                    expenseCount,
                    totalCount
                });
            });

            // 6. 重新计算：拆分收入/支出/结余的总额（核心修复结余逻辑）
            let lineTotalIncomeNum = 0;    // 当月总收入
            let lineTotalExpenseNum = 0;   // 当月总支出
            let lineTotalBalanceNum = 0;   // 当月总结余（收入-支出）
            let lineTotalIncomeCount = 0;  // 当月收入笔数
            let lineTotalExpenseCount = 0; // 当月支出笔数
            let lineTotalBalanceCount = 0; // 当月结余笔数（收入+支出）

            // 遍历所有日期，分别统计收入/支出/结余的总额和总笔数
            xData.forEach(day => {
                const dayData = dayMap.get(day) || {
                    income: "0.00", expense: "0.00",
                    incomeCount: 0, expenseCount: 0, totalCount: 0
                };

                // 收入统计
                const dayIncomeNum = Number(dayData.income);
                lineTotalIncomeNum += dayIncomeNum;
                lineTotalIncomeCount += dayData.incomeCount;

                // 支出统计
                const dayExpenseNum = Number(dayData.expense);
                lineTotalExpenseNum += dayExpenseNum;
                lineTotalExpenseCount += dayData.expenseCount;

                // 结余统计（核心：收入-支出，笔数=收入笔数+支出笔数）
                const dayBalanceNum = dayIncomeNum - dayExpenseNum;
                lineTotalBalanceNum += dayBalanceNum;
                lineTotalBalanceCount += (dayData.incomeCount + dayData.expenseCount);
            });

            // 根据type确定最终的总额和总笔数（修复结余的总额关联）
            let lineTotalAmountNum = 0;
            let lineTotalCount = 0;
            switch (type) {
                case 1: // 收入
                    lineTotalAmountNum = lineTotalIncomeNum;
                    lineTotalCount = lineTotalIncomeCount;
                    break;
                case 2: // 支出
                    lineTotalAmountNum = lineTotalExpenseNum;
                    lineTotalCount = lineTotalExpenseCount;
                    break;
                case 100: // 结余（核心修复：使用结余总额）
                    lineTotalAmountNum = lineTotalBalanceNum;
                    lineTotalCount = lineTotalBalanceCount;
                    break;
            }

            // 7. 第一步：收集所有有效数据（用于计算最高金额）
            const tempAllData: Array<{
                day: number;
                date: string;
                bill_time: string;
                amountNum: number;
                amountStr: string;
                count: number;
            }> = [];

            // 填充xAxisData并收集所有数据
            const xAxisData: string[] = [];
            xData.forEach(day => {
                const defaultBillTime = formatDate(year, month, day) + 'T00:00:00.000Z';
                const dayData = dayMap.get(day) || {
                    date: formatDate(year, month, day),
                    bill_time: defaultBillTime,
                    income: "0.00",
                    expense: "0.00",
                    incomeCount: 0,
                    expenseCount: 0,
                    totalCount: 0
                };

                let amountNum = 0;
                let amountStr = "0.00";
                let dayCount = 0;

                // 按type计算当日金额和笔数（核心修复结余逻辑）
                switch (type) {
                    case 1: // 收入
                        amountNum = Number(dayData.income);
                        dayCount = dayData.incomeCount;
                        break;
                    case 2: // 支出
                        amountNum = Number(dayData.expense);
                        dayCount = dayData.expenseCount;
                        break;
                    case 100: // 结余（核心修复）
                        amountNum = Number(dayData.income) - Number(dayData.expense);
                        dayCount = dayData.incomeCount + dayData.expenseCount;
                        break;
                }
                amountStr = formatAmount(amountNum);

                // 填充xAxisData（保持X轴正序）
                xAxisData.push(amountStr);

                // 收集所有数据（用于后续计算最高金额）
                tempAllData.push({
                    day,
                    date: dayData.date,
                    bill_time: dayData.bill_time,
                    amountNum,
                    amountStr,
                    count: dayCount
                });
            });

            // 8. 计算最高金额（核心：基于所有有效金额的最大值）
            // 过滤出金额≠0的数据，避免最高金额为0
            const validAmounts = tempAllData.map(item => Math.abs(item.amountNum)).filter(num => num > 0);
            const maxAmount = validAmounts.length > 0 ? Math.max(...validAmounts) : 0;

            // 9. 第二步：生成list并计算基于最高金额的占比
            const tempLineList: Array<{
                day: number;
                date: string;
                bill_time: string;
                amount: string;
                count: number;
                ratio: number;
                ratioPercent: string;
            }> = [];

            tempAllData.forEach(item => {
                let ratio = 0;
                let ratioPercent = "0.00";

                // 计算占比（基于最高金额）
                if (maxAmount > 0) {
                    // 取绝对值计算占比（避免负数影响，比如结余为负时也按绝对值算）
                    ratio = Number((Math.abs(item.amountNum) / maxAmount).toFixed(4));
                    ratioPercent = `${(ratio * 100).toFixed(2)}`;
                }

                // 过滤条件（结余：笔数>0 或 金额≠0；收入/支出：金额>0）
                const isKeep = type === 100
                    ? (item.count > 0 || item.amountNum !== 0)
                    : (item.amountNum > 0);

                if (isKeep) {
                    tempLineList.push({
                        day: item.day,
                        date: item.date,
                        bill_time: item.bill_time,
                        amount: item.amountStr,
                        count: item.count,
                        ratio: ratio,
                        ratioPercent: ratioPercent
                    });
                }
            });

            // 10. 排序并移除临时字段
            const lineList = tempLineList
                .sort((a, b) => compareTimeDesc(a.bill_time, b.bill_time))
                .map(({ bill_time, ...rest }) => rest);

            // 格式化总金额（支持负数，适配结余）
            const lineSummary = {
                totalCount: lineTotalCount,
                totalAmount: formatAmount(lineTotalAmountNum)
            };

            // 11. 饼图数据处理（核心：新增结余饼图逻辑+按百分比排序）
            let pieSummary = {
                totalCategory: 0,
                totalAmount: "0.00",
                type: "结余" as string
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
                const pieParams = [
                    userId,
                    // 修正参数顺序：原参数顺序错误（timeCondition的参数应该在type前面）
                    normalizedDate.match(/^\d{4}-\d{2}-\d{2}$/) ? normalizedDate : normalizedDate,
                    pieType,
                    ...(bookId && bookId > 0 ? [bookId] : [])
                ];
                const [pieRows] = await pool.execute(pieSql, pieParams);
                const rawList = (pieRows as any[]).map(item => ({
                    categoryId: item.categoryId ? Number(item.categoryId) : null,
                    categoryIcon: item.categoryIcon || '',
                    categoryName: item.categoryName || '未分类',
                    amount: Number(item.amount) || 0,
                    count: Number(item.categoryCount) || 0
                })).filter(item => item.amount > 0);

                const totalAmount = rawList.reduce((sum, item) => sum + item.amount, 0);
                const list = rawList.map(item => {
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
                        type: pieType === '1' ? "收入" : "支出"
                    };
                });

                // 查询后先按百分比排序
                return {
                    totalCategory: list.length,
                    totalAmount: formatAmount(totalAmount),
                    list: sortPieDataByPercent(list)
                };
            };

            if (type === 1) {
                // 收入饼图
                const incomePie = await queryPieData('1');
                pieSummary = {
                    totalCategory: incomePie.totalCategory,
                    totalAmount: incomePie.totalAmount,
                    type: "收入"
                };
                pieList = incomePie.list;
            } else if (type === 2) {
                // 支出饼图
                const expensePie = await queryPieData('2');
                pieSummary = {
                    totalCategory: expensePie.totalCategory,
                    totalAmount: expensePie.totalAmount,
                    type: "支出"
                };
                pieList = expensePie.list;
            } else {
                // 结余饼图：合并收入+支出分类（核心修复）
                const incomePie = await queryPieData('1');
                const expensePie = await queryPieData('2');

                // 合并收支分类，标注类型区分
                const mergeList = [
                    ...incomePie.list.map(item => ({ ...item, name: `收入-${item.name}` })),
                    ...expensePie.list.map(item => ({ ...item, name: `支出-${item.name}` }))
                ];

                // 合并后再按百分比整体排序（关键：结余饼图也按占比降序）
                pieList = sortPieDataByPercent(mergeList);

                // 结余饼图汇总：总分类数=收入分类+支出分类，总金额=总结余
                pieSummary = {
                    totalCategory: incomePie.totalCategory + expensePie.totalCategory,
                    totalAmount: formatAmount(lineTotalBalanceNum),
                    type: "结余"
                };
            }

            // 12. 返回最终结果
            return {
                chartData: {
                    lineData: {
                        xData,
                        xAxisData,
                        summary: lineSummary,
                        list: lineList
                    },
                    PieData: {
                        summary: pieSummary,
                        list: pieList
                    }
                }
            };

        } catch (error: any) {
            console.error('calendarMonthChart 查询失败：', {
                userId, bookId, start_time, type,
                error: error.message,
                stack: error.stack
            });
            const { year, month } = parseDateStr(start_time);
            const xData = getMonthDays(year, month);
            const pieTypeText = type === 1 ? "收入" : type === 2 ? "支出" : "结余";

            return {
                chartData: {
                    lineData: {
                        xData,
                        xAxisData: xData.map(() => "0.00"),
                        summary: { totalCount: 0, totalAmount: "0.00" },
                        list: []
                    },
                    PieData: {
                        summary: {
                            totalCategory: 0,
                            totalAmount: "0.00",
                            type: pieTypeText
                        },
                        list: []
                    }
                }
            };
        }
    }
    // 保留生成当月日期的工具方法（需放在类中）
    private generateMonthDays(year: number, month: number): string[] {
        const days: string[] = [];
        // 获取当月最后一天
        const lastDay = new Date(year, month, 0).getDate();
        for (let i = 1; i <= lastDay; i++) {
            days.push(i.toString().padStart(2, '0')); // 格式化为 01,02...31
        }
        return days;
    }




}

export default new CalendarModule();

