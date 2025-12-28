import pool from '../../db';
import type {UserDbSchema, BillDbSchema, ApiResponse, PaginationData} from "../../types";
import {v4 as uuidv4} from "uuid";
import dayjs from 'dayjs';
import {formatAmount, parseJsonToArray} from "../../utils/tools"
import HttpError from '../../utils/HttpError';
import userModule from "./UserModule";
import pointModule from "./PointModule";

class BillModule {
    billTableName = 'mate_bill';
    private budgetTableName = 'mate_budget';
    private budgetCategoryTableName = 'mate_budget_category';

    /**
     * 创建账单
     * @param params
     */
    async create(params: BillDbSchema): Promise<string | undefined> {
        // 1. 构造默认数据
        const defaultData = {
            uuid: uuidv4(),
            user_id: params.user_id,
            book_id: params.book_id,
            consume_user_id: params.consume_user_id,
            category_id: params.category_id,
            amount: params.amount,
            remark: params.remark || '',
            type: params.type, // 2=支出，1=收入
            currency: params.currency || 'CNY',
            bill_time: params.bill_time,
            tags: params.tags || null,
            created_at: new Date(),
            updated_at: new Date(),
        };
        let result: any;
        try {
            // 2. 执行插入账单SQL
            [result] = await pool.execute(
                `INSERT INTO ${this.billTableName}
                 (uuid, user_id, book_id, category_id, consume_user_id, amount, type, currency, bill_time, tags, remark,
                  created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    defaultData.uuid,
                    defaultData.user_id,
                    defaultData.book_id,
                    defaultData.category_id,
                    defaultData.consume_user_id,
                    defaultData.amount,
                    defaultData.type,
                    defaultData.currency,
                    defaultData.bill_time,
                    defaultData.tags,
                    defaultData.remark,
                    defaultData.created_at,
                    defaultData.updated_at,
                ]
            );

            // 3. 仅处理支出类型的账单（type=2），更新预算实际支出
            if ((result as any).affectedRows === 1 && defaultData.type === 2) {
                await this.updateBudgetActualAmountAfterBillCreate(defaultData);
            }
            /***新增经验 & 积分**START*/
            await userModule.addBillExp(defaultData.user_id,  (result as any).insertId);
            // await userModule.addExpByBizType(defaultData.user_id, 'bill_add', (result as any).insertId);
            await pointModule.addPoints(
                defaultData.user_id,
                1, // 奖励1积分
                'bill_add', // 业务类型：添加账单
                '新增账单奖励积分', // 备注
                (result as any).insertId // 业务ID：账单ID（防重复发放）
            );
            /***新增经验 & 积分**END*/
            return (result as any).affectedRows.toString();
        } catch (error) {
            const err = error as Error & { code: string };
            if (err.code === "ER_NO_REFERENCED_ROW_2") {
                console.error("❌ 外键错误：账本/分类ID不存在");
            } else if (err.code === "ER_DUP_ENTRY") {
                console.error("❌ 唯一键冲突：账单ID已存在");
            } else {
                console.error("❌ 插入账单失败：", err.message);
            }
            throw new HttpError(`创建账单失败：${err.message}`, 500);
        }
    }

    // ========== 核心新增：新增账单后更新预算实际支出 ==========
    /**
     * 新增支出账单后，更新对应预算/分类预算的实际支出
     * @param billData 新增的账单数据
     */
    private async updateBudgetActualAmountAfterBillCreate(billData: any) {
        try {
            // 1. 解析账单时间，匹配所属周期的主预算
            const billTime = dayjs(billData.bill_time);
            const budget = await this.getBudgetByBillTime(
                billData.user_id,
                billData.book_id,
                billTime
            );

            if (!budget) {
                console.warn(`⚠️ 未找到账单${billData.uuid}所属周期的预算，跳过更新`);
                return;
            }

            // 2. 重新计算该预算周期的总实际支出
            const totalActualAmount = await this.calculateBudgetActualExpense(
                billData.user_id,
                billData.book_id,
                budget.cycle_start,
                budget.cycle_end
            );

            // 3. 更新主预算表的实际支出
            await pool.execute(
                // `UPDATE ${this.budgetTableName}
                //  SET actual_amount = ?,
                //      updated_at    = NOW()
                //  WHERE id = ?`,
                // [totalActualAmount, budget.id]

                `UPDATE ${this.budgetTableName}
                 SET actual_amount     = ?,
                     -- 同步计算主预算的剩余百分比（保留负数，仅防护除以0）
                     remaining_percent = IF(
                             amount = 0, -- 主预算金额为0时，百分比设为0
                             0,
                             ROUND(((amount - ?) / amount) * 100, 2) -- 保留负数，无范围限制
                                         ),
                     updated_at        = NOW() -- 补充更新时间（可选，建议加）
                 WHERE id = ?`,
                // 参数顺序：actualAmount → 用于计算百分比的实际支出 → budgetId
                [totalActualAmount, totalActualAmount, budget.id]
            );
            console.log(`✅ 主预算ID ${budget.id} 实际支出更新为：${totalActualAmount}元`);

            // 4. 重新计算该分类在该预算周期的实际支出
            const categoryActualAmount = await this.calculateCategoryActualExpense(
                billData.user_id,
                billData.book_id,
                budget.cycle_start,
                budget.cycle_end,
                billData.category_id
            );
            // 5. 更新分类预算表的实际支出
            const [rows] = await pool.execute(
                `SELECT *
                 FROM ${this.budgetCategoryTableName}
                 WHERE budget_id = ?
                   AND category_id = ? LIMIT 1`,
                [budget.id, billData.category_id]
            );

            // @ts-ignore
            // console.log(rows[0].category_amount);
            //--------
            // const newCategoryActual = Math.max(0, Number(category_current_actual) - Number(deleted_amount));
            // const categoryTotalBudget = Number(bill.category_total_budget) || 0;

            // 核心修正：允许负数百分比

            let categoryRemainingPercent = 0
            // @ts-ignore
            if (rows[0].category_amount > 0) {
                // @ts-ignore
                categoryRemainingPercent = Number(((rows[0].category_amount - categoryActualAmount) / rows[0].category_amount * 100).toFixed(2));
            } else {
                categoryRemainingPercent = 0;
            }
            console.log(categoryRemainingPercent)
            await pool.execute(
                `UPDATE ${this.budgetCategoryTableName}
                 SET category_actual_amount = ?,
                     remaining_percent      = ?,
                     updated_at             = NOW()
                 WHERE budget_id = ?
                   AND category_id = ?`,
                [categoryActualAmount, categoryRemainingPercent, budget.id, billData.category_id]
            );

            console.log(`✅ 预算ID ${budget.id} 分类ID ${billData.category_id} 实际支出更新为：${categoryActualAmount}元`);
        } catch (error: any) {
            console.error(`⚠️ 更新预算实际支出失败：${error.message}`, error);
            // 不抛出错误，避免影响账单创建（预算更新失败不回滚账单）
        }
    }

    // ========== 辅助方法：根据账单时间匹配所属预算 ==========
    private async getBudgetByBillTime(user_id: number, book_id: number, billTime: dayjs.Dayjs): Promise<{
        id: number;
        cycle_start: string;
        cycle_end: string;
        cycle_type: string
    } | null> {
        // 构造不同周期的查询条件
        const billDate = billTime.format('YYYY-MM-DD');
        let querySql = '';
        let queryParams: any[] = [];

        // 优先匹配精准周期（按 day/week/month/year/custom 顺序）
        querySql = `
            SELECT id, cycle_start, cycle_end, cycle_type
            FROM ${this.budgetTableName}
            WHERE user_id = ?
              AND book_id = ?
              AND cycle_start <= ?
              AND cycle_end >= ?
            ORDER BY FIELD(cycle_type, 'custom', 'day', 'week', 'month', 'year') LIMIT 1
        `;
        queryParams = [user_id, book_id, billDate, billDate];

        const [rows] = await pool.execute(querySql, queryParams);
        const budgetList = rows as Array<{ id: number; cycle_start: string; cycle_end: string; cycle_type: string }>;
        return budgetList.length > 0 ? budgetList[0] : null;
    }

    // ========== 辅助方法：计算预算周期总实际支出（复用你原有的逻辑） ==========
    private async calculateBudgetActualExpense(user_id: number, book_id: number, cycle_start: string, cycle_end: string): Promise<number> {
        const [rows] = await pool.execute(
            `SELECT IFNULL(SUM(amount), 0) AS total_expense
             FROM ${this.billTableName}
             WHERE user_id = ?
               AND book_id = ?
               AND type = 2
               AND bill_time BETWEEN ? AND ?`,
            [user_id, book_id, cycle_start, cycle_end]
        );

        const resultRows = rows as Array<{ total_expense: number | string }>;
        const rawTotal = resultRows[0]?.total_expense ?? 0;
        return Math.round(Number(rawTotal) * 100) / 100;
    }

    // ========== 辅助方法：计算分类实际支出（复用你原有的逻辑） ==========
    private async calculateCategoryActualExpense(user_id: number, book_id: number, cycle_start: string, cycle_end: string, category_id: number): Promise<number> {
        const [rows] = await pool.execute(
            `SELECT IFNULL(SUM(amount), 0) AS total_expense
             FROM ${this.billTableName}
             WHERE user_id = ?
               AND book_id = ?
               AND type = 2
               AND category_id = ?
               AND bill_time BETWEEN ? AND ?`,
            [user_id, book_id, category_id, cycle_start, cycle_end]
        );

        const resultRows = rows as Array<{ total_expense: number | string }>;
        const rawTotal = resultRows[0]?.total_expense ?? 0;
        return Math.round(Number(rawTotal) * 100) / 100;
    }

    async billList(userId: number, page?: number, pageSize?: number, start_time?: string, end_time?: string, bookId?: number, type?: number | null | undefined, categoryId?: number): Promise<any> {
        // 金额格式化工具函数
        const formatAmount = (amount: number): string => {
            return amount.toFixed(2);
        };

        try {
            // 1. 分页参数标准化
            const validPage = Math.max(Number(page) || 1, 1);
            const validPageSize = Math.max(Number(pageSize) || 1000, 1);
            const offset = (validPage - 1) * validPageSize;
            const offsetStr = String(offset);
            const pageSizeStr = String(validPageSize);

            // 2. 时间参数核心解析逻辑
            const now = new Date();
            let defaultStart = new Date(1970, 0, 1, 0, 0, 0);
            let defaultEnd = new Date(now.getTime());
            let isDateLevelQuery = false;

            // 查询用户账单的实际时间边界
            const getBillTimeBoundary = async (userId: number, bookId?: number) => {
                let boundaryConditions: string[] = ['b.user_id = ?'];
                let boundaryParams: (number | null)[] = [userId];

                if (bookId !== null && bookId !== undefined && Number(bookId) > 0) {
                    boundaryConditions.push('b.book_id = ?');
                    boundaryParams.push(Number(bookId));
                }

                const [boundaryRows] = await pool.execute(
                    `SELECT IFNULL(MIN(b.bill_time), '1970-01-01 00:00:00') AS min_time,
                        IFNULL(MAX(b.bill_time), NOW())                 AS max_time
                 FROM ${this.billTableName} b
                 WHERE ${boundaryConditions.join(' AND ')}`,
                    boundaryParams
                );

                const minTimeStr = (boundaryRows as any[])[0]?.min_time || '1970-01-01 00:00:00';
                const maxTimeStr = (boundaryRows as any[])[0]?.max_time || new Date().toISOString().slice(0, 19).replace('T', ' ');

                return {
                    minTime: new Date(minTimeStr),
                    maxTime: new Date(maxTimeStr)
                };
            };

            if (!start_time && !end_time) {
                const {minTime, maxTime} = await getBillTimeBoundary(userId, bookId);
                defaultStart = minTime;
                defaultEnd = maxTime;
            }

            // 时间格式化函数
            const formatTimeByRule = (date: Date, isDateLevel: boolean): string => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                if (isDateLevel) {
                    const day = String(date.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                }
                return `${year}-${month}`;
            };

            const formatToFullTime = (date: Date): string => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                const seconds = String(date.getSeconds()).padStart(2, '0');
                return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            };

            const getPeriodTime = (timeStr: string): {
                start: Date;
                end: Date;
                dimension: 'year' | 'month' | 'custom';
                year: number;
                month?: number;
                isDateLevel: boolean;
                originalStr: string
            } => {
                if (!timeStr) {
                    throw new Error('时间字符串不能为空');
                }
                if (/^\d{4}$/.test(timeStr)) {
                    const year = Number(timeStr);
                    return {
                        start: new Date(year, 0, 1, 0, 0, 0),
                        end: new Date(year, 11, 31, 23, 59, 59),
                        dimension: 'year',
                        year,
                        isDateLevel: false,
                        originalStr: timeStr
                    };
                } else if (/^\d{4}-\d{2}$/.test(timeStr)) {
                    const [year, month] = timeStr.split('-').map(Number);
                    return {
                        start: new Date(year, month - 1, 1, 0, 0, 0),
                        end: new Date(year, month, 0, 23, 59, 59),
                        dimension: 'month',
                        year,
                        month,
                        isDateLevel: false,
                        originalStr: timeStr
                    };
                } else if (/^\d{4}-\d{2}-\d{2}$/.test(timeStr)) {
                    const [year, month, day] = timeStr.split('-').map(Number);
                    return {
                        start: new Date(year, month - 1, day, 0, 0, 0),
                        end: new Date(year, month - 1, day, 23, 59, 59),
                        dimension: 'custom',
                        year,
                        month,
                        isDateLevel: true,
                        originalStr: timeStr
                    };
                } else {
                    throw new Error(`时间格式错误：${timeStr}，仅支持 YYYY、YYYY-MM、YYYY-MM-DD`);
                }
            };

            // 确定最终起止时间
            let finalStartTime: string = formatToFullTime(defaultStart);
            let finalEndTime: string = formatToFullTime(defaultEnd);
            let queryDimension: 'year' | 'month' | 'custom' = 'custom';
            let targetYear = now.getFullYear();
            let targetMonth = now.getMonth() + 1;
            let displayStartTime: string = formatTimeByRule(defaultStart, true);
            let displayEndTime: string = formatTimeByRule(defaultEnd, true);
            let originalStartStr = '';
            let originalEndStr = '';

            if (start_time) {
                const startPeriod = getPeriodTime(start_time);
                originalStartStr = startPeriod.originalStr;
                queryDimension = startPeriod.dimension;
                targetYear = startPeriod.year;
                targetMonth = startPeriod.month || 0;
                isDateLevelQuery = startPeriod.isDateLevel;

                if (end_time) {
                    const endPeriod = getPeriodTime(end_time);
                    originalEndStr = endPeriod.originalStr;
                    if (startPeriod.start > endPeriod.end) {
                        throw new Error('开始时间不能晚于结束时间');
                    }
                    finalStartTime = formatToFullTime(startPeriod.start);
                    finalEndTime = formatToFullTime(endPeriod.end);
                    isDateLevelQuery = isDateLevelQuery || endPeriod.isDateLevel;
                    queryDimension = 'custom';
                    displayStartTime = originalStartStr;
                    displayEndTime = originalEndStr;
                } else {
                    finalStartTime = formatToFullTime(startPeriod.start);
                    finalEndTime = formatToFullTime(startPeriod.end);
                    displayStartTime = originalStartStr;
                    displayEndTime = originalStartStr;
                }
            } else if (end_time) {
                const endPeriod = getPeriodTime(end_time);
                originalEndStr = endPeriod.originalStr;
                finalStartTime = formatToFullTime(defaultStart);
                finalEndTime = formatToFullTime(endPeriod.end);
                isDateLevelQuery = endPeriod.isDateLevel;
                displayStartTime = formatTimeByRule(defaultStart, isDateLevelQuery);
                displayEndTime = originalEndStr;
            }

            // ---------------------- 关键1：全量收支统计（新增数量统计） ----------------------
            let fullWhereConditions: string[] = ['b.user_id = ?'];
            let fullQueryParams: (string | number | null)[] = [userId];
            fullWhereConditions.push('b.bill_time BETWEEN ? AND ?');
            fullQueryParams.push(finalStartTime, finalEndTime);
            if (bookId !== null && bookId !== undefined && Number(bookId) > 0) {
                fullWhereConditions.push('b.book_id = ?');
                fullQueryParams.push(Number(bookId));
            }
            if (categoryId !== null && categoryId !== undefined && Number(categoryId) > 0) {
                fullWhereConditions.push('b.category_id = ?');
                fullQueryParams.push(Number(categoryId));
            }

            // 全量统计：金额 + 数量（收入笔数/支出笔数/总笔数）
            const [fullSummaryRows] = await pool.execute(
                `SELECT IFNULL(SUM(CASE WHEN b.type = 1 THEN b.amount ELSE 0 END), 0.00) AS fullIncomeTotal,
                    IFNULL(SUM(CASE WHEN b.type = 2 THEN b.amount ELSE 0 END), 0.00) AS fullExpendTotal,
                    IFNULL(COUNT(CASE WHEN b.type = 1 THEN 1 END), 0) AS fullIncomeCount, -- 收入笔数
                    IFNULL(COUNT(CASE WHEN b.type = 2 THEN 1 END), 0) AS fullExpendCount, -- 支出笔数
                    IFNULL(COUNT(*), 0) AS fullTotalCount -- 总笔数
             FROM ${this.billTableName} b
             WHERE ${fullWhereConditions.join(' AND ')}`,
                fullQueryParams
            );

            const totalIncome = Number((fullSummaryRows as any[])[0]?.fullIncomeTotal || 0);
            const totalExpend = Number((fullSummaryRows as any[])[0]?.fullExpendTotal || 0);
            const totalSurplus = Number((totalIncome - totalExpend).toFixed(2));
            // 新增：全量数量统计
            const totalIncomeCount = Number((fullSummaryRows as any[])[0]?.fullIncomeCount || 0); // 总收入笔数
            const totalExpendCount = Number((fullSummaryRows as any[])[0]?.fullExpendCount || 0); // 总支出笔数
            const totalBillCount = Number((fullSummaryRows as any[])[0]?.fullTotalCount || 0);   // 总账单笔数

            // ---------------------- 关键2：列表查询（新增 categoryId 筛选） ----------------------
            let whereConditions: string[] = ['b.user_id = ?'];
            let queryParams: (string | number | null)[] = [userId];

            if (type === 1) {
                whereConditions.push('b.type = 1');
            } else if (type === 2) {
                whereConditions.push('b.type = 2');
            }
            whereConditions.push('b.bill_time BETWEEN ? AND ?');
            queryParams.push(finalStartTime, finalEndTime);
            if (bookId !== null && bookId !== undefined && Number(bookId) > 0) {
                whereConditions.push('b.book_id = ?');
                queryParams.push(Number(bookId));
            }
            if (categoryId !== null && categoryId !== undefined && Number(categoryId) > 0) {
                whereConditions.push('b.category_id = ?');
                queryParams.push(Number(categoryId));
            }

            const listQueryParams = [...queryParams, offsetStr, pageSizeStr];
            const [listRows] = await pool.execute(
                `SELECT b.id,
                    b.user_id,
                    b.amount,
                    b.type,
                    b.currency,
                    DATE_FORMAT(b.bill_time, '%Y-%m-%d %H:%i:%s')                                  AS full_bill_time,
                    DATE_FORMAT(b.bill_time, '%H:%i')                                              AS bill_time,
                    DATE_FORMAT(b.bill_time, '%Y')                                                 AS bill_year,
                    DATE_FORMAT(b.bill_time, '%m')                                                 AS bill_month,
                    DATE_FORMAT(b.bill_time, '%d')                                                 AS bill_day,
                    b.tags,
                    b.remark,
                    DATE_FORMAT(CONVERT_TZ(b.created_at, '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s') AS created_at,
                    DATE_FORMAT(CONVERT_TZ(b.updated_at, '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s') AS updated_at,
                    c.name                                                                         AS category_name,
                    c.icon                                                                         AS category_icon,
                    c.type                                                                         AS category_type,
                    bo.id                                                                          AS book_id,
                    bo.name                                                                        AS book_name,
                    bo.is_default                                                                  AS book_is_default
             FROM ${this.billTableName} b
                      LEFT JOIN mate_category c ON b.category_id = c.id
                      LEFT JOIN mate_book bo ON b.book_id = bo.id
             WHERE ${whereConditions.join(' AND ')}
             ORDER BY b.bill_time DESC LIMIT ?, ?`,
                listQueryParams
            );

            // ---------------------- 格式化账单 & 计算列表级收支（新增数量统计） ----------------------
            let currentPageIncome = 0;
            let currentPageExpend = 0;
            let listTotalIncome = 0;
            let listTotalExpend = 0;
            // 新增：列表数量统计
            let currentPageIncomeCount = 0; // 当前页收入笔数
            let currentPageExpendCount = 0; // 当前页支出笔数
            let listTotalIncomeCount = 0;   // 列表总收入笔数
            let listTotalExpendCount = 0;   // 列表总支出笔数

            const rawBillList = (listRows as any[]).map(item => {
                const amount = Number(item.amount || 0);
                if (item.type === 1) {
                    currentPageIncome += amount;
                    listTotalIncome += amount;
                    currentPageIncomeCount++; // 当前页收入笔数+1
                    listTotalIncomeCount++;   // 列表收入笔数+1
                } else if (item.type === 2) {
                    currentPageExpend += amount;
                    listTotalExpend += amount;
                    currentPageExpendCount++; // 当前页支出笔数+1
                    listTotalExpendCount++;   // 列表支出笔数+1
                }

                return {
                    id: item.id || 0,
                    user_id: item.user_id || 0,
                    amount: amount,
                    type: item.type || 0,
                    currency: item.currency || '',
                    full_bill_time: item.full_bill_time || '',
                    bill_time: item.bill_time || '',
                    remark: item.remark || '',
                    tags: (() => {
                        try {
                            return JSON.parse(item.tags || '[]');
                        } catch {
                            return [];
                        }
                    })(),
                    created_at: item.created_at || '',
                    updated_at: item.updated_at || '',
                    singleProgress: 0,
                    category: {
                        name: item.category_name || '未分类',
                        icon: item.category_icon || '',
                        type: item.category_type || 0,
                        id: item.category_id || 0
                    },
                    book: {
                        id: item.book_id || 0,
                        name: item.book_name || '默认账本',
                        is_default: item.book_is_default || 0
                    },
                    _year: item.bill_year || '',
                    _month: item.bill_month || '',
                    _day: item.bill_day || ''
                };
            });

            const currentPageSurplus = Number((currentPageIncome - currentPageExpend).toFixed(2));
            const listTotalSurplus = Number((listTotalIncome - listTotalExpend).toFixed(2));
            // 新增：列表/当前页数量汇总
            const currentPageTotalCount = currentPageIncomeCount + currentPageExpendCount; // 当前页总笔数
            const listTotalCount = listTotalIncomeCount + listTotalExpendCount;             // 列表总笔数

            // ---------------------- 核心逻辑：日期分组 + 动态基准值计算 ----------------------
            // 1. 日期分组初始化
            const dayGroupMap = new Map<string, any>();
            rawBillList.forEach(bill => {
                if (!bill._year || !bill._month || !bill._day) return;

                const dayKey = `${bill._year}-${bill._month}-${bill._day}`;
                if (!dayGroupMap.has(dayKey)) {
                    dayGroupMap.set(dayKey, {
                        year: bill._year,
                        month: bill._month,
                        day: bill._day,
                        weekday: '',
                        name: `${bill._month}月${bill._day}日`,
                        incomeMoney: 0,
                        expendMoney: 0,
                        surplusMoney: 0,
                        incomeProgress: 0,
                        expendProgress: 0,
                        surplusProgress: 0,
                        surplusDirection: "",
                        list: []
                    });
                }
                const dayGroup = dayGroupMap.get(dayKey)!;

                // 累加当日收支
                if (bill.type === 1) {
                    dayGroup.incomeMoney += bill.amount;
                } else if (bill.type === 2) {
                    dayGroup.expendMoney += bill.amount;
                }

                // 暂存账单（后续更新进度）
                const {_year, _month, _day, ...pureBill} = bill;
                dayGroup.list.push({
                    ...pureBill,
                    amount: pureBill.amount.toFixed(2),
                    singleProgress: 0
                });
            });

            // 2. 补全星期几
            const getWeekday = (year: string, month: string, day: string) => {
                if (!year || !month || !day) return '';
                const date = new Date(Number(year), Number(month) - 1, Number(day));
                if (isNaN(date.getTime())) return '';
                const weekdayMap = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
                return weekdayMap[date.getDay()];
            };
            Array.from(dayGroupMap.values()).forEach(dayGroup => {
                dayGroup.weekday = getWeekday(dayGroup.year, dayGroup.month, dayGroup.day);
            });

            // 3. 计算全局动态基准值（收入/支出中的最大值）
            const dayGroupList = Array.from(dayGroupMap.values());
            const allIncome = dayGroupList.map(day => day.incomeMoney);
            const allExpend = dayGroupList.map(day => day.expendMoney);
            const globalMaxIncome = Math.max(...allIncome, 0);
            const globalMaxExpend = Math.max(...allExpend, 0);
            const dynamicBaseMax = Math.max(globalMaxIncome, globalMaxExpend);

            // 4. 进度计算工具函数（限制0%~100%）
            const calculateProgress = (current: number, baseMax: number): number => {
                if (baseMax === 0) return 0;
                const progress = (current / baseMax) * 100;
                return Number(Math.min(Math.max(progress, 0), 100).toFixed(1));
            };

            // 5. 计算每日进度（基于动态基准值）
            dayGroupList.forEach(dayGroup => {
                dayGroup.incomeProgress = calculateProgress(dayGroup.incomeMoney, dynamicBaseMax);
                dayGroup.expendProgress = calculateProgress(dayGroup.expendMoney, dynamicBaseMax);
                dayGroup.surplusMoney = Number((dayGroup.incomeMoney - dayGroup.expendMoney).toFixed(2));
                dayGroup.surplusDirection = dayGroup.surplusMoney >= 0 ? "盈余" : "赤字";
                dayGroup.surplusProgress = calculateProgress(Math.abs(dayGroup.surplusMoney), dynamicBaseMax);

                // 单个账单进度（动态基准）
                // @ts-ignore
                dayGroup.list.forEach(bill => {
                    bill.singleProgress = calculateProgress(Number(bill.amount), dynamicBaseMax);
                });
            });

            // ---------------------- 月份分组（基于动态基准值） ----------------------
            const monthGroupMap = new Map<string, any>();
            dayGroupList.forEach(dayGroup => {
                const monthKey = `${dayGroup.year}-${dayGroup.month}`;
                if (!monthGroupMap.has(monthKey)) {
                    monthGroupMap.set(monthKey, {
                        year: dayGroup.year,
                        month: dayGroup.month,
                        name: `${dayGroup.year}年${Number(dayGroup.month)}月`,
                        incomeMoney: 0,
                        expendMoney: 0,
                        surplusMoney: 0,
                        incomeProgress: 0,
                        expendProgress: 0,
                        surplusProgress: 0,
                        surplusDirection: "",
                        children: []
                    });
                }
                const monthGroup = monthGroupMap.get(monthKey)!;

                // 累加当月收支
                monthGroup.incomeMoney += dayGroup.incomeMoney;
                monthGroup.expendMoney += dayGroup.expendMoney;

                // 当月进度（基于动态基准值）
                monthGroup.incomeProgress = calculateProgress(monthGroup.incomeMoney, dynamicBaseMax);
                monthGroup.expendProgress = calculateProgress(monthGroup.expendMoney, dynamicBaseMax);
                // 当月盈余
                monthGroup.surplusMoney = Number((monthGroup.incomeMoney - monthGroup.expendMoney).toFixed(2));
                monthGroup.surplusDirection = monthGroup.surplusMoney >= 0 ? "盈余" : "赤字";
                monthGroup.surplusProgress = calculateProgress(Math.abs(monthGroup.surplusMoney), dynamicBaseMax);

                // 加入日期分组
                monthGroup.children.push(dayGroup);
            });

            // ---------------------- 空数据兜底 & 金额格式化 ----------------------
            const monthList = Array.from(monthGroupMap.values()).map(monthGroup => ({
                ...monthGroup,
                incomeMoney: monthGroup.incomeMoney.toFixed(2),
                expendMoney: monthGroup.expendMoney.toFixed(2),
                surplusMoney: monthGroup.surplusMoney.toFixed(2),
                incomeProgress: monthGroup.incomeProgress,
                expendProgress: monthGroup.expendProgress,
                surplusProgress: monthGroup.surplusProgress,
                // 格式化日期分组
                children: monthGroup.children.map((dayGroup: any) => ({
                    ...dayGroup,
                    incomeMoney: dayGroup.incomeMoney.toFixed(2),
                    expendMoney: dayGroup.expendMoney.toFixed(2),
                    surplusMoney: dayGroup.surplusMoney.toFixed(2),
                    incomeProgress: dayGroup.incomeProgress,
                    expendProgress: dayGroup.expendProgress,
                    surplusProgress: dayGroup.surplusProgress,
                    list: dayGroup.list.map((bill: any) => ({
                        ...bill,
                        amount: bill.amount,
                        singleProgress: bill.singleProgress,
                        status:true
                    }))
                })).sort((a: any, b: any) => Number(b.day) - Number(a.day))
            })).sort((a, b) => {
                if (a.year !== b.year) return Number(b.year) - Number(a.year);
                return Number(b.month) - Number(a.month);
            });

            if (monthList.length === 0) {
                const startDate = new Date(finalStartTime);
            }

            const formattedList = {
                ...(queryDimension === 'custom' ? {
                    timeRange: {
                        start: displayStartTime,
                        end: displayEndTime
                    }
                } : {
                    year: targetYear,
                    ...(queryDimension === 'month' ? {month: targetMonth} : {})
                }),
                listType: 'month',
                dataList: monthList
            };

            // ---------------------- 总条数查询 ----------------------
            let total = 0;
            const [countRows] = await pool.execute(
                `SELECT COUNT(*) AS total
             FROM ${this.billTableName} b
             WHERE ${whereConditions.join(' AND ')}`,
                queryParams
            );
            total = Number((countRows as any[])[0]?.total || 0);
            const totalPage = Math.ceil(total / validPageSize);

            // ---------------------- 全局进度计算 ----------------------
            const incomeProgress = calculateProgress(listTotalIncome, dynamicBaseMax);
            const expendProgress = calculateProgress(listTotalExpend, dynamicBaseMax);
            const surplusProgress = calculateProgress(Math.abs(listTotalSurplus), dynamicBaseMax);
            const currentPageSurplusProgress = calculateProgress(Math.abs(currentPageSurplus), dynamicBaseMax);

            // ---------------------- 返回结果（新增数量字段） ----------------------
            return {
                code: 200,
                list: formattedList,
                summary: {
                    // 金额维度（原有）
                    totalIncome: formatAmount(totalIncome),         // 全量总收入
                    totalExpend: formatAmount(totalExpend),         // 全量总支出
                    totalSurplus: formatAmount(totalSurplus),       // 全量总盈余
                    listIncome: formatAmount(listTotalIncome),      // 列表总收入
                    listExpend: formatAmount(listTotalExpend),      // 列表总支出
                    listSurplus: formatAmount(listTotalSurplus),    // 列表总盈余
                    currentPageIncome: currentPageIncome.toFixed(2),// 当前页收入
                    currentPageExpend: currentPageExpend.toFixed(2),// 当前页支出
                    currentPageSurplus: currentPageSurplus.toString(),// 当前页盈余
                    // 数量维度（新增）
                    totalIncomeCount: totalIncomeCount,             // 全量收入笔数
                    totalExpendCount: totalExpendCount,             // 全量支出笔数
                    totalBillCount: totalBillCount,                 // 全量总笔数
                    listIncomeCount: listTotalIncomeCount,          // 列表收入笔数
                    listExpendCount: listTotalExpendCount,          // 列表支出笔数
                    listTotalCount: listTotalCount,                 // 列表总笔数
                    currentPageIncomeCount: currentPageIncomeCount, // 当前页收入笔数
                    currentPageExpendCount: currentPageExpendCount, // 当前页支出笔数
                    currentPageTotalCount: currentPageTotalCount,   // 当前页总笔数
                    // 其他原有字段
                    year: null,
                    month: null,
                    start_year: new Date(finalStartTime).getFullYear(),
                    start_month: new Date(finalStartTime).getMonth() + 1,
                    end_year: new Date(finalEndTime).getFullYear(),
                    end_month: new Date(finalEndTime).getMonth() + 1,
                    queryDimension: queryDimension,
                    surplusDirection: totalSurplus >= 0 ? "盈余" : "赤字",
                    currentPageSurplusProgress: currentPageSurplusProgress,
                    incomeProgress: incomeProgress,
                    expendProgress: expendProgress,
                    surplusProgress: surplusProgress,
                    start_time: displayStartTime,
                    end_time: displayEndTime,
                    progressDesc: `进度基准：${dynamicBaseMax === globalMaxIncome ? '收入' : '支出'}最大值(${dynamicBaseMax.toFixed(2)})=100%`,
                    filterType: type === undefined || type === null ? 'all' : type,
                    filterCategoryId: categoryId || 'all',
                    emptyTip: total === 0 ? '当前筛选条件下无账单数据' : ''
                },
                pagination: {
                    total,
                    page: validPage,
                    pageSize: validPageSize,
                    totalPage
                }
            };
        } catch (error: any) {
            console.error('查询账单列表失败：', error.message, error.stack);

            const now = new Date();
            const defaultYear = now.getFullYear();
            const defaultMonth = now.getMonth() + 1;
            const formatTimeByRule = (date: Date, isDateLevel: boolean): string => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                if (isDateLevel) {
                    const day = String(date.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                }
                return `${year}-${month}`;
            };
            const displayStartTime = formatTimeByRule(new Date(1970, 0, 1), false);
            const displayEndTime = formatTimeByRule(now, false);

            // 异常场景：数量字段兜底为0
            return {
                code: 500,
                message: error.message || '查询账单失败',
                list: {},
                summary: {
                    // 金额维度兜底
                    totalIncome: "0.00",
                    totalExpend: "0.00",
                    totalSurplus: "0.00",
                    listIncome: "0.00",
                    listExpend: "0.00",
                    listSurplus: "0.00",
                    currentPageIncome: "0.00",
                    currentPageExpend: "0.00",
                    currentPageSurplus: "0.00",
                    // 数量维度兜底
                    totalIncomeCount: 0,
                    totalExpendCount: 0,
                    totalBillCount: 0,
                    listIncomeCount: 0,
                    listExpendCount: 0,
                    listTotalCount: 0,
                    currentPageIncomeCount: 0,
                    currentPageExpendCount: 0,
                    currentPageTotalCount: 0,
                    // 其他原有字段
                    year: defaultYear,
                    month: defaultMonth,
                    start_year: defaultYear,
                    start_month: defaultMonth,
                    end_year: defaultYear,
                    end_month: defaultMonth,
                    queryDimension: 'custom',
                    surplusDirection: "盈余",
                    currentPageSurplusProgress: 0,
                    incomeProgress: 0,
                    expendProgress: 0,
                    surplusProgress: 0,
                    start_time: displayStartTime,
                    end_time: displayEndTime,
                    progressDesc: "",
                    filterType: type === undefined || type === null ? 'all' : type,
                    filterCategoryId: categoryId || 'all',
                    emptyTip: '查询异常，暂无数据'
                },
                pagination: {
                    total: 0,
                    page: Math.max(Number(page) || 1, 1),
                    pageSize: Math.max(Number(pageSize) || 10, 1),
                    totalPage: 0
                }
            };
        }
    }
    /**
     * 删除支出账单（type=2），并重新计算分类预算/主预算金额
     * @param userId 用户ID
     * @param billId 账单ID
     */
    async removeBill(userId: number, billId: number): Promise<{
        code: number;
        message: string;
        data?: Record<string, any>;
    }> {
        const realUserId = Number(userId);
        const realBillId = Number(billId);
        let totalBookExpense = 0;

        if (isNaN(realUserId) || realUserId <= 0 || isNaN(realBillId) || realBillId <= 0) {
            console.error("删除账单失败：参数非法", { userId, billId, realUserId, realBillId });
            return { code: 400, message: "参数错误：用户ID和账单ID必须为正整数" };
        }

        let connection;
        try {
            connection = await pool.getConnection();
            await connection.beginTransaction();
            // 修复日志格式，清晰展示参数
            console.log(`开始删除账单事务 → 账单ID: ${realBillId}，用户ID: ${realUserId}`);

            // 步骤1：查询账单完整信息（含主预算关联，不依赖分类预算）
            const [billRows] = await connection.execute(
                `SELECT b.id                       AS bill_id,
                        b.user_id                  AS bill_user_id,
                        b.category_id              AS bill_category_id,
                        b.book_id                  AS bill_book_id,
                        b.amount                   AS bill_amount,
                        b.type                     AS bill_type,
                        b.bill_time,
                        -- 关联分类预算
                        mbc.id                     AS category_budget_id,
                        mbc.budget_id              AS related_budget_id,
                        mbc.category_amount        AS category_total_budget,
                        mbc.category_actual_amount AS category_current_actual,
                        -- 直接关联主预算（即使无分类预算，也能拿到账本对应的主预算）
                        mb.id                      AS main_budget_id,
                        mb.amount                  AS main_total_budget,
                        mb.actual_amount           AS main_current_actual,
                        mb.remaining_percent       AS main_remaining_percent,
                        mb.cycle_start,
                        mb.cycle_end
                 FROM mate_bill b
                          LEFT JOIN mate_budget_category mbc
                                    ON b.user_id = mbc.user_id
                                        AND b.book_id = mbc.book_id
                                        AND b.category_id = mbc.category_id
                     -- 新增：直接按用户+账本匹配主预算（不依赖分类预算）
                          LEFT JOIN mate_budget mb
                                    ON b.user_id = mb.user_id
                                        AND b.book_id = mb.book_id
                                        AND DATE (b.bill_time) BETWEEN mb.cycle_start AND mb.cycle_end
                 WHERE (b.id = ?
                   AND b.user_id = ?)
                    OR (b.id = ?
                   AND b.user_id = ?)
                   AND b.type = 2
                     LIMIT 1`,
                [realBillId, realUserId, realUserId, realBillId]
            );

            const bill = (billRows as any[])[0];
            if (!bill) {
                // 处理非支出账单逻辑
                const [otherBillRows] = await connection.execute(
                    `SELECT id, type
                     FROM mate_bill
                     WHERE (id = ? AND user_id = ?)
                        OR (id = ? AND user_id = ?)
                         AND type
                         != 2 LIMIT 1`,
                    [realBillId, realUserId, realUserId, realBillId]
                );
                if ((otherBillRows as any[]).length > 0) {
                    const [deleteRes] = await connection.execute(
                        `DELETE
                         FROM mate_bill
                         WHERE (id = ? AND user_id = ?)
                            OR (id = ? AND user_id = ?)
                             AND type
                             != 2`,
                        [realBillId, realUserId, realUserId, realBillId]
                    );
                    await connection.commit();
                    return {
                        code: 200,
                        message: `非支出账单删除成功（type=${(otherBillRows as any[])[0].type}，不影响预算）`,
                        data: { affectedRows: (deleteRes as any).affectedRows }
                    };
                }
                await connection.rollback();
                return { code: 404, message: "支出账单不存在或不属于当前用户" };
            }

            // 步骤2：删除支出账单
            const [deleteRes] = await connection.execute(
                `DELETE
                 FROM mate_bill
                 WHERE (id = ? AND user_id = ?)
                    OR (id = ? AND user_id = ?)
                     AND type = 2`,
                [realBillId, realUserId, realUserId, realBillId]
            );
            const deleteAffectedRows = (deleteRes as any).affectedRows;
            if (deleteAffectedRows === 0) {
                await connection.rollback();
                return { code: 500, message: "支出账单删除失败（数据未变更）" };
            }
            console.log("账单删除成功，金额：", bill.bill_amount);

            // 步骤3：统一处理预算更新（覆盖有/无分类预算场景）
            let budgetUpdateResult = { categoryUpdated: false, mainUpdated: false };
            const {
                bill_amount: deleted_amount,
                bill_category_id: category_id,
                bill_book_id: book_id,
                category_budget_id,
                related_budget_id: mainBudgetId,
                category_current_actual,
                main_current_actual,
                main_total_budget, // 主预算总金额
                cycle_start,
                cycle_end
            } = bill;

            // 3.1 处理分类预算退回（有分类预算时）
            if (category_budget_id) {
                const newCategoryActual = Math.max(0, Number(category_current_actual) - Number(deleted_amount));
                // 计算剩余百分比：(总预算 - 实际支出) / 总预算 * 100，保留2位小数（允许负数）
                const categoryTotalBudget = Number(bill.category_total_budget) || 0;
                let remainingPercent = 0;
                if (categoryTotalBudget > 0) {
                    // 核心修正：移除0-100的限制，保留真实百分比（支持负数）
                    remainingPercent = Number(((categoryTotalBudget - newCategoryActual) / categoryTotalBudget * 100).toFixed(2));
                }

                await connection.execute(
                    `UPDATE mate_budget_category mbc
                 SET mbc.category_actual_amount = ?,
                     mbc.remaining_percent      = ?, -- 新增：更新剩余百分比（支持负数）
                     mbc.updated_at             = NOW()
                 WHERE mbc.id = ?`,
                    [newCategoryActual, remainingPercent, category_budget_id]
                );
                console.log("分类预算退回：", deleted_amount, "更新后实际支出：", newCategoryActual, "剩余百分比：", remainingPercent + "%");
                budgetUpdateResult.categoryUpdated = true;
            }

            // 3.2 处理主预算更新（核心修复：无论是否有分类预算，都更新主预算）
            // 优先用账单关联的主预算ID，无则按用户+账本重新查询
            const targetMainBudgetId = mainBudgetId || bill.main_budget_id;
            if (targetMainBudgetId) {
                // 重新统计账本总支出（精准）
                const [totalExpenseRows] = await connection.execute(
                    `SELECT IFNULL(CAST(SUM(b.amount) AS DECIMAL(16, 2)), 0.00) AS total_book_expense
                     FROM mate_bill b
                     WHERE b.user_id = ?
                       AND b.book_id = ?
                       AND b.type = 2
                       AND (b.is_deleted IS NULL OR b.is_deleted = 0)
                       AND b.amount > 0
                   -- 限定预算周期（避免统计跨周期账单）
                       AND DATE (b.bill_time) BETWEEN ?
                       AND ?`,
                    [realUserId, book_id, cycle_start || '1970-01-01', cycle_end || '9999-12-31']
                );

                totalBookExpense = Number((totalExpenseRows as any[])[0]?.total_book_expense || 0.00);
                console.log("重新统计的账本总支出：", totalBookExpense);

                // 计算主预算剩余百分比（和分类预算逻辑一致）
                const mainTotalBudget = Number(main_total_budget) || 0;
                let mainRemainingPercent = 0;
                if (mainTotalBudget > 0) {
                    // 剩余百分比 = (总预算 - 实际支出) / 总预算 * 100，保留2位小数（支持负数）
                    mainRemainingPercent = Number(((mainTotalBudget - totalBookExpense) / mainTotalBudget * 100).toFixed(2));
                }

                // 更新主预算（包含remaining_percent）
                await connection.execute(
                    `UPDATE mate_budget mb
                 SET mb.actual_amount = ?,
                     mb.remaining_percent = ?,
                     mb.updated_at    = NOW()
                 WHERE mb.id = ?`,
                    [totalBookExpense, mainRemainingPercent, targetMainBudgetId]
                );

                console.log("主预算更新：", {
                    mainTotalBudget,
                    newActualAmount: totalBookExpense,
                    remainingPercent: mainRemainingPercent + "%"
                });
                budgetUpdateResult.mainUpdated = true;
            } else {
                // 兜底：无主预算ID时，按用户+账本查询并创建/更新主预算（可选）
                console.warn("未匹配到主预算，跳过主预算更新", { userId: realUserId, bookId: book_id });
            }

            // 步骤4：提交事务
            await connection.commit()

            // 步骤5：返回精准提示
            return {
                code: 200,
                message: (() => {
                    if (budgetUpdateResult.categoryUpdated && budgetUpdateResult.mainUpdated) {
                        return `支出账单删除成功，已退回分类预算金额¥${deleted_amount}，总预算已重新计算`;
                    } else if (budgetUpdateResult.mainUpdated) {
                        return `支出账单删除成功，总预算已重新计算（无分类预算）`;
                    } else if (budgetUpdateResult.categoryUpdated) {
                        return `支出账单删除成功，已退回分类预算金额¥${deleted_amount}（主预算未匹配）`;
                    } else {
                        return "支出账单删除成功（无匹配预算，仅删除账单）";
                    }
                })(),
                data: {
                    affectedRows: deleteAffectedRows,
                    budgetUpdate: budgetUpdateResult,
                    refundAmount: deleted_amount,
                    newCategoryActual: category_budget_id ? Math.max(0, Number(category_current_actual) - Number(deleted_amount)) : 0,
                    newMainActual: totalBookExpense,
                    mainRemainingPercent: targetMainBudgetId ? Number(((Number(main_total_budget) - totalBookExpense) / (Number(main_total_budget) || 1) * 100).toFixed(2)) : 0
                }
            };

        } catch (error) {
            if (connection) await connection.rollback();
            console.error("删除账单事务异常", {
                billId: realBillId,
                userId: realUserId,
                error: (error as Error).message,
                stack: (error as Error).stack
            });
            return { code: 500, message: `删除账单失败：${(error as Error).message || "服务器内部错误"}` };
        } finally {
            if (connection) connection.release();
        }
    }

    /**
     * 查询单条账单详情
     * @param userId 用户ID（校验账单归属，防止越权）
     * @param billId 账单ID
     * @returns 账单详情数据
     */
    async billInfo(userId: number, billId: number): Promise<any> {
        try {


            const getWeekday = (year: string, month: string, day: string) => {
                const date = new Date(Number(year), Number(month) - 1, Number(day));
                const weekdayMap = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
                return weekdayMap[date.getDay()];
            };

            // 2. 参数校验
            const validUserId = Number(userId);
            const validBillId = Number(billId);
            if (isNaN(validUserId) || validUserId <= 0) {
                return {
                    code: 400,
                    msg: '用户ID无效',
                    data: null
                };
            }
            if (isNaN(validBillId) || validBillId <= 0) {
                return {
                    code: 400,
                    msg: '账单ID无效',
                    data: null
                };
            }

            // 3. 查询账单详情（关联分类、账本表，校验用户归属）
            const [billRows] = await pool.execute(
                `SELECT b.id,
                        b.user_id,
                        b.amount,
                        b.type,   -- 1=收入，2=支出
                        b.currency,
                        DATE_FORMAT(CONVERT_TZ(b.bill_time, '+00:00', '+08:00'), '%Y-%m-%d %H:%i')     AS bill_time,
                        DATE_FORMAT(CONVERT_TZ(b.bill_time, '+00:00', '+08:00'), '%Y')                 AS bill_year,
                        DATE_FORMAT(CONVERT_TZ(b.bill_time, '+00:00', '+08:00'), '%m')                 AS bill_month,
                        DATE_FORMAT(CONVERT_TZ(b.bill_time, '+00:00', '+08:00'), '%d')                 AS bill_day,
                        b.tags,   -- 标签（JSON字符串）
                        b.remark, -- 备注（可选）
                        DATE_FORMAT(CONVERT_TZ(b.created_at, '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s') AS created_at,
                        DATE_FORMAT(CONVERT_TZ(b.updated_at, '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s') AS updated_at,
                        -- 分类信息
                        c.id                                                                           AS category_id,
                        c.name                                                                         AS category_name,
                        c.icon                                                                         AS category_icon,
                        c.type                                                                         AS category_type,
                        -- 账本信息
                        bo.id                                                                          AS book_id,
                        bo.name                                                                        AS book_name,
                        bo.is_default                                                                  AS book_is_default
                 FROM ${this.billTableName} b
                          LEFT JOIN mate_category c ON b.category_id = c.id
                          LEFT JOIN mate_book bo ON b.book_id = bo.id
                 WHERE b.id = ?
                   AND b.user_id = ?`,
                [validBillId, validUserId]
            );

            // 4. 校验账单是否存在（且归属当前用户）
            const billItem = (billRows as any[])[0];
            if (!billItem) {
                return {
                    code: 404,
                    msg: '账单不存在或无访问权限',
                    data: null
                };
            }

            // 5. 格式化账单数据
            const formattedBill = {
                id: billItem.id,
                user_id: billItem.user_id,
                amount: formatAmount(billItem.amount), // 金额（保留两位小数，字符串）
                amountNumber: formatAmount(billItem.amount, 'number'), // 金额（数字类型，便于计算）
                type: billItem.type,
                typeText: billItem.type === 1 ? '收入' : '支出', // 类型文本
                currency: billItem.currency || 'CNY', // 币种，默认人民币
                bill_time: billItem.bill_time,
                // 日期维度
                dateInfo: {
                    year: billItem.bill_year,
                    month: billItem.bill_month,
                    day: billItem.bill_day,
                    weekday: getWeekday(billItem.bill_year, billItem.bill_month, billItem.bill_day) // 星期
                },
                tags: parseJsonToArray(billItem.tags), // 解析标签数组
                remark: billItem.remark || '', // 备注（空值处理）
                created_at: billItem.created_at,
                updated_at: billItem.updated_at,
                // 分类信息
                category: {
                    id: billItem.category_id || 0,
                    name: billItem.category_name || '未分类',
                    icon: billItem.category_icon || '',
                    type: billItem.category_type || billItem.type // 分类类型默认和账单类型一致
                },
                // 账本信息
                book: {
                    id: billItem.book_id || 0,
                    name: billItem.book_name || '默认账本',
                    is_default: billItem.book_is_default || 0
                }
            };

            // 6. 返回成功结果
            return {
                code: 200,
                msg: '查询成功',
                data: formattedBill
            };
        } catch (error: any) {
            console.error('查询账单详情失败：', error.message, error.stack);
            // 7. 异常处理
            return {
                code: 500,
                msg: '服务器内部错误',
                data: null,
                error: process.env.NODE_ENV === 'development' ? error.message : '' // 开发环境返回错误详情
            };
        }
    }


}

export default new BillModule();

