import dayjs from "dayjs";
import pool from '../../db';
import HttpError from "../../utils/HttpError";
import type {BudgetDbSchema, UserDbSchema} from "../../types";
// @ts-ignore
import {getWeekOfYear} from "../../utils/dateUtils";

type CycleType = 'day' | 'week' | 'month' | 'year' | 'custom';

class BillModule {
    budgetTableName = 'mate_budget';
    billTableName = 'mate_bill';
    budgetCategoryTableName = 'mate_budget_category';

    /**
     * 按 cycle_type 判断预算是否唯一
     * @returns boolean：true=唯一，false=重复
     * @param user_id
     * @param book_id
     * @param cycle_type
     * @param cycle_start
     * @param cycle_end
     */
    async isBudgetUniqueByCycleType(user_id: number, book_id: number, cycle_type: "day" | "week" | "month" | "year" | "custom", cycle_start: string, cycle_end: string): Promise<boolean> {
        let querySql = "";
        let queryParams: any[] = [];

        // 按 cycle_type 动态生成校验SQL
        switch (cycle_type) {
            case "day":
                // 日预算：同一用户+账本+日期（cycle_start）只能有1个
                querySql = `
                    SELECT id
                    FROM ${this.budgetTableName}
                    WHERE user_id = ?
                      AND book_id = ?
                      AND cycle_type = 'day'
                      AND cycle_start = ?
                `;
                queryParams = [user_id, book_id, cycle_start];
                break;

            case "week":
                // 周预算：同一用户+账本+周（按自定义方法计算年份+周数）
                const {year, week} = getWeekOfYear(cycle_start);
                querySql = `
                    SELECT id
                    FROM ${this.budgetTableName}
                    WHERE user_id = ? AND book_id = ? AND cycle_type = 'week'
                        AND YEAR (
                        cycle_start) = ?
                      AND WEEK(cycle_start) = ?
                `;
                queryParams = [user_id, book_id, year, week];
                break;

            case "month":
                // 月预算：同一用户+账本+年月
                const month = dayjs(cycle_start).month() + 1; // dayjs 月份从0开始
                const yearMonth = dayjs(cycle_start).year();
                querySql = `
                    SELECT id
                    FROM ${this.budgetTableName}
                    WHERE user_id = ? AND book_id = ? AND cycle_type = 'month'
                        AND YEAR (
                        cycle_start) = ?
                      AND MONTH (cycle_start) = ?
                `;
                queryParams = [user_id, book_id, yearMonth, month];
                break;

            case "year":
                // 年预算：同一用户+账本+年份
                const yearYear = dayjs(cycle_start).year();
                querySql = `
                    SELECT id
                    FROM ${this.budgetTableName}
                    WHERE user_id = ? AND book_id = ? AND cycle_type = 'year'
                              AND YEAR (cycle_start) = ?
                `;
                queryParams = [user_id, book_id, yearYear];
                break;

            case "custom":
                // 自定义预算：同一用户+账本+时间区间（start+end）
                if (!cycle_end) throw new Error("自定义周期必须传入 cycle_end");
                querySql = `
                    SELECT id
                    FROM ${this.budgetTableName}
                    WHERE user_id = ?
                      AND book_id = ?
                      AND cycle_type = 'custom'
                      AND cycle_start = ?
                      AND cycle_end = ?
                `;
                queryParams = [user_id, book_id, cycle_start, cycle_end];
                break;

            default:
                throw new HttpError(`不支持的周期类型：${cycle_type}`, 403);
        }
        // 执行查询，判断是否存在重复预算
        const [rows] = await pool.execute(querySql, queryParams);

        return Array.isArray(rows) && rows.length === 0; // true=唯一，false=重复
    }

    /**
     * 计算指定周期内的支出总金额（复用/内联 getActualAmount 逻辑）
     * @param user_id 用户ID
     * @param book_id 账本ID
     * @param cycle_start 开始日期
     * @param cycle_end 结束日期
     * @returns 支出总金额（保留2位小数）
     */
    private async calculateActualExpense(user_id: number, book_id: number, cycle_start: string, cycle_end: string): Promise<number> {
        // 校验日期格式（和 getActualAmount 保持一致）
        const dateReg = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateReg.test(cycle_start) || !dateReg.test(cycle_end)) {
            throw new HttpError('日期格式错误：请传入 YYYY-MM-DD 格式的日期', 400);
        }
        if (new Date(cycle_start) > new Date(cycle_end)) {
            throw new HttpError('日期错误：开始日期不能晚于结束日期', 400);
        }

        // 查询支出总金额
        const [rows] = await pool.execute(
            `SELECT IFNULL(SUM(amount), 0) AS total_expense
             FROM ${this.billTableName}
             WHERE user_id = ?
               AND book_id = ?
               AND type = 2 -- 仅计算支出类
               AND bill_time BETWEEN ? AND ?`,
            [user_id, book_id, cycle_start, cycle_end]
        );

        // 安全处理数值
        const resultRows = rows as Array<{ total_expense: number | string }>;
        const rawTotal = resultRows[0]?.total_expense ?? 0;
        const totalExpense = Number(rawTotal);
        const fixedTotal = Math.round(totalExpense * 100) / 100; // 保留2位小数
        return fixedTotal;
    }

    /**
     * 创建预算（基于 cycle_type 校验唯一性，创建后自动计算并更新实际支出）
     */
    async create(budgetData: BudgetDbSchema): Promise<{budget_id: number;actual_amount: number;category_bill_count: number;message: string}> {
        // 提前统一计算周期结束时间（避免多处计算不一致）
        const cycleEnd = budgetData.cycle_end || this.getCycleEndByType(budgetData.cycle_type, budgetData.cycle_start);

        // 1. 校验唯一性（判断预算是否存在）
        const isUnique = await this.isBudgetUniqueByCycleType(
            budgetData.user_id,
            budgetData.book_id,
            budgetData.cycle_type,
            budgetData.cycle_start,
            cycleEnd // 使用统一的cycleEnd
        );

        let budgetId: number | undefined;
        let isUpdate = false;
        let categoryCount = 0;

        // 2. 预算已存在 → 执行更新逻辑
        if (!isUnique) {
            try {
                const [existBudget] = await pool.execute(
                    `SELECT id
                     FROM ${this.budgetTableName}
                     WHERE user_id = ?
                       AND book_id = ?
                       AND cycle_type = ?
                       AND cycle_start = ?
                       AND cycle_end = ?`,
                    [
                        budgetData.user_id,
                        budgetData.book_id,
                        budgetData.cycle_type,
                        budgetData.cycle_start,
                        cycleEnd // 统一cycleEnd
                    ]
                );
                budgetId = (existBudget as any)[0]?.id;
                if (!budgetId || !Number.isInteger(budgetId) || budgetId <= 0) {
                    throw new HttpError(`未找到${budgetData.cycle_type}周期的预算记录`, 404);
                }

                await pool.execute(
                    `UPDATE ${this.budgetTableName}
                     SET amount     = ?,
                         sort_order = ?,
                         is_active  = ?,
                         updated_at = NOW()
                     WHERE id = ?`,
                    [
                        budgetData.amount,
                        budgetData.sort_order || 0,
                        budgetData.is_active || 1,
                        budgetId
                    ]
                );
                isUpdate = true;
            } catch (error: any) {
                throw new HttpError(`更新${budgetData.cycle_type}周期预算失败：${error.message}`, 500);
            }
        }
        // 3. 预算不存在 → 执行新增逻辑
        else {
            try {
                const [result] = await pool.execute(
                    `INSERT INTO ${this.budgetTableName}
                     (user_id, book_id, amount, actual_amount, cycle_type, cycle_start, cycle_end, sort_order,
                      is_active)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        budgetData.user_id,
                        budgetData.book_id,
                        budgetData.amount,
                        0.00, // 初始值后续更新
                        budgetData.cycle_type,
                        budgetData.cycle_start,
                        cycleEnd, // 统一cycleEnd
                        budgetData.sort_order || 0,
                        budgetData.is_active || 1,
                    ]
                );
                budgetId = (result as any).insertId;
                // 新增后校验budgetId有效性
                if (!budgetId || !Number.isInteger(budgetId) || budgetId <= 0) {
                    throw new HttpError("创建预算失败：未生成有效预算ID", 500);
                }
            } catch (error: any) {
                if (error.code === "ER_DUP_ENTRY") {
                    throw new HttpError(`创建失败：${budgetData.cycle_type}周期预算已存在`, 403);
                }
                throw new HttpError(`创建预算失败：${error.message}`, 500);
            }
        }

        // 4. 处理分类预算（新增/更新）+ 计算分类实际支出
        if (budgetData.categories && Array.isArray(budgetData.categories) && budgetData.categories.length > 0) {
            const categories = budgetData.categories as unknown as Array<{
                category_id: number | string;
                category_amount: number;
                category_name?: string;
            }>;

            const categoryParams = categories.map(item => [
                budgetData.user_id,
                budgetData.book_id,
                budgetId,
                Number(item.category_id),
                item.category_name,
                item.category_amount,
                Number(budgetData.sort_order) || 99,
                budgetData.is_active || 1,
                new Date(),
                new Date()
            ]);

            try {
                // 4.1 批量UPSERT分类预算
                const [categoryResult] = await pool.execute(
                    `INSERT INTO ${this.budgetCategoryTableName}
                     (user_id, book_id, budget_id, category_id, category_name, category_amount, sort_order, is_active,
                      created_at,
                      updated_at)
                     VALUES ${categoryParams.map(() => '(?, ?, ?, ?, ?, ?, ?,?, ?, ?)').join(',')} ON DUPLICATE KEY
                    UPDATE
                        category_name =
                    VALUES (category_name), category_amount =
                    VALUES (category_amount), sort_order =
                    VALUES (sort_order), is_active =
                    VALUES (is_active), updated_at =
                    VALUES (updated_at)`,
                    categoryParams.flat()
                );
                categoryCount = (categoryResult as any).affectedRows;

                // 4.2 计算并更新分类实际支出金额
                for (const item of categories) {
                    const categoryId = Number(item.category_id);
                    if (!Number.isInteger(categoryId) || categoryId <= 0) {
                        console.warn(`跳过非法分类ID：${item.category_id}`);
                        continue;
                    }
                    const categoryName = item.category_name;
                    const categoryActualAmount = await this.calculateCategoryActualExpense(
                        budgetData.user_id,
                        budgetData.book_id,
                        budgetData.cycle_start,
                        cycleEnd, // 统一cycleEnd
                        categoryId
                    );

                    // 替换你原有仅更新 category_actual_amount 的 SQL 语句
                    await pool.execute(
                        `UPDATE ${this.budgetCategoryTableName}
                         SET category_actual_amount = ?,
                             remaining_percent      = IF(
                                     category_amount = 0,
                                     0,
                                 -- 移除GREATEST(0, ...)，保留负数百分比
                                     ROUND(((category_amount - ?) / category_amount) * 100, 2)
                                                      ),
                             updated_at             = NOW()
                         WHERE budget_id = ?
                           AND category_id = ?`,
                        [categoryActualAmount, categoryActualAmount, budgetId, categoryId]
                    );
                    console.log(`分类[ID:${categoryId}${categoryName}] 实际支出更新为：${categoryActualAmount}元`);
                }
            } catch (error: any) {
                throw new HttpError(`处理分类预算失败：${error.message}`, 500);
            }
        }

        // 5. 计算主预算实际支出（增加异常捕获和数值校验）
        let actualAmount = 0.00;
        try {
            actualAmount = await this.calculateActualExpense(
                budgetData.user_id,
                budgetData.book_id,
                budgetData.cycle_start,
                cycleEnd // 统一cycleEnd
            );
            // 校验实际支出数值有效性
            if (!Number.isFinite(actualAmount) || actualAmount < 0) {
                actualAmount = 0.00;
                console.warn("计算的实际支出金额异常，重置为0.00");
            }
        } catch (error: any) {
            console.error(`计算${budgetData.cycle_type}周期支出金额失败：`, error.message);
            actualAmount = 0.00; // 兜底赋值
        }

        console.log("更新主预算参数：", {budgetId,actualAmount,budgetIdValid: Number.isInteger(budgetId) && budgetId > 0,actualAmountValid: actualAmount >= 0});

        // 6. 更新主预算实际支出（核心修复：增加强校验+错误捕获+日志）
        if (Number.isInteger(budgetId) && budgetId > 0 && actualAmount >= 0) {
            try {
                const [updateResult] = await pool.execute(
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
                    [actualAmount, actualAmount, budgetId]
                );
                // 检查更新是否生效
                const affectedRows = (updateResult as any).affectedRows;
                if (affectedRows === 0) {
                    console.error(`更新主预算实际支出失败：预算ID ${budgetId} 不存在或金额未变化`, {
                        budgetId,
                        actualAmount,
                        affectedRows
                    });
                } else {
                    console.log(`主预算ID ${budgetId} 实际支出更新成功：${actualAmount}元`);
                }
            } catch (error: any) {
                console.error(`更新主预算实际支出SQL执行失败：`, error.message, {
                    budgetId,
                    actualAmount,
                    sql: `UPDATE ${this.budgetTableName}
                          SET actual_amount = ${actualAmount}
                          WHERE id = ${budgetId}`
                });
                // 可选：抛出错误或继续执行
                throw new HttpError(`更新预算实际支出失败：${error.message}`, 500);
            }
        } else {
            console.error("更新主预算条件不满足：", {
                budgetId,
                actualAmount,
                budgetIdValid: Number.isInteger(budgetId) && budgetId > 0,
                actualAmountValid: actualAmount >= 0
            });
        }

        // 7. 返回结果
        const baseMessage = isUpdate
            ? `${budgetData.cycle_type}周期预算更新成功`
            : `${budgetData.cycle_type}周期预算创建成功`;
        const message = categoryCount > 0
            ? `${baseMessage}，处理分类预算账单${categoryCount}笔，当前实际支出：${actualAmount}元`
            : `${baseMessage}，当前实际支出：${actualAmount}元`;

        return {
            budget_id: budgetId || 0,
            actual_amount: actualAmount,
            category_bill_count: categoryCount,
            message: message
        };
    }

    /**
     * 计算指定周期内特定分类的支出总金额
     * @param user_id 用户ID
     * @param book_id 账本ID
     * @param cycle_start 周期开始日期
     * @param cycle_end 周期结束日期
     * @param category_id 分类ID
     * @returns 分类支出总金额（保留2位小数）
     */
    private async calculateCategoryActualExpense(user_id: number, book_id: number, cycle_start: string, cycle_end: string, category_id: number): Promise<number> {
        // 校验日期格式
        const dateReg = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateReg.test(cycle_start) || !dateReg.test(cycle_end)) {
            throw new HttpError('日期格式错误：请传入 YYYY-MM-DD 格式的日期', 400);
        }
        if (new Date(cycle_start) > new Date(cycle_end)) {
            throw new HttpError('日期错误：开始日期不能晚于结束日期', 400);
        }

        // 查询账单表中该分类的支出总金额（type=2 表示支出）
        const [rows] = await pool.execute(
            `SELECT IFNULL(SUM(amount), 0) AS total_expense
             FROM ${this.billTableName}
             WHERE user_id = ?
               AND book_id = ?
               AND type = 2        -- 支出类型
               AND category_id = ? -- 特定分类
               AND bill_time BETWEEN ? AND ?`,
            [user_id, book_id, category_id, cycle_start, cycle_end]
        );

        // 格式化金额（保留2位小数）
        const resultRows = rows as Array<{ total_expense: number | string }>;
        const rawTotal = resultRows[0]?.total_expense ?? 0;
        const totalExpense = Number(rawTotal);
        return Math.round(totalExpense * 100) / 100;
    }

    // 原有辅助方法保留
    private getCycleEndByType(cycleType: string, cycleStart: string): string {
        switch (cycleType) {
            case "day":
                return cycleStart;
            case "week":
                const {sunday} = this.getWeekRange(dayjs(cycleStart).year(), getWeekOfYear(cycleStart).week);
                return sunday;
            case "month":
                return dayjs(cycleStart).endOf("month").format("YYYY-MM-DD");
            case "year":
                return dayjs(cycleStart).endOf("year").format("YYYY-MM-DD");
            default:
                return cycleStart;
        }
    }

    /**
     * 查询预算是否存在
     * @param user_id
     * @param book_id
     * @param budget_id
     */
    async findById(user_id: number, book_id: number, budget_id: number): Promise<boolean> {
        let querySql = ` SELECT id
                         FROM ${this.budgetTableName}
                         WHERE user_id = ?
                           AND book_id = ?
                           AND id = ?`;
        let queryParams = [user_id, book_id, budget_id];
        // 执行查询，判断是否存在重复预算
        const [rows] = await pool.execute(querySql, queryParams);
        // console.log(Array.isArray(rows) && rows.length === 0)
        return Array.isArray(rows) && rows.length === 0; // true=唯一，false=重复
    }

    // 补充 getWeekRange 方法（和 dateFormat.ts 保持一致，避免依赖）
    private getWeekRange(year: number, week: number): { monday: string; sunday: string } {
        const firstDayOfYear = new Date(year, 0, 1);
        const firstDayWeekday = firstDayOfYear.getDay();

        let firstWeekMonday: Date;
        if (firstDayWeekday === 1) {
            firstWeekMonday = firstDayOfYear;
        } else if (firstDayWeekday === 0) {
            firstWeekMonday = new Date(year, 0, 1 - 6);
        } else {
            firstWeekMonday = new Date(year, 0, 1 - (firstDayWeekday - 1));
        }

        const targetMonday = new Date(firstWeekMonday);
        targetMonday.setDate(firstWeekMonday.getDate() + (week - 1) * 7);
        const targetSunday = new Date(targetMonday);
        targetSunday.setDate(targetMonday.getDate() + 6);

        const format = (date: Date) => dayjs(date).format('YYYY-MM-DD');
        return {
            monday: format(targetMonday),
            sunday: format(targetSunday)
        };
    }

    /**
     * 预算详情
     * @param userId
     * @param bookId
     */
    async info(userId: number, bookId: number): Promise<any> {
        const [budgetRows] = await pool.execute(
            `SELECT id
             FROM ${this.budgetTableName}
             WHERE user_id = ?
               AND book_id = ? LIMIT 1`,
            [userId, bookId]
        );
        const budgetInfo = (budgetRows as any[])[0];
        if (!budgetInfo) {
            return {
                code: 200,
                data: {
                    remaining_amount: "0.00",
                    remaining_percent: 100,
                    amount: "0.00",
                    remaining_daily_amount: 0,
                    surplus_amount: "0.00"
                },
                message: "查询预算详情成功"
            }
        }
        // @ts-ignore
        let budgetId = (budgetRows as any)[0].id as number;

        try {
            // 1. 先补充参数校验（避免非法参数）
            if (!userId || userId <= 0) {
                return {
                    code: 400,
                    data: {},
                    message: "用户ID必须为正整数"
                };
            }
            if (!budgetId || budgetId <= 0) {
                return {
                    code: 400,
                    data: {},
                    message: "预算ID必须为正整数"
                };
            }

            // 2. 查询预算详情（关联账本，格式化日期）
            const [rows] = await pool.execute(
                `SELECT
                     -- 预算核心字段
                     b.id,
                     b.user_id,
                     b.book_id,
                     b.amount,
                     b.actual_amount,
                     b.remaining_percent,
                     -- b.year, -- 补充年份（用于计算当月天数）
                     -- b.month, -- 补充月份（用于计算当月天数）
                     -- 日期格式化：UTC→东八区
                     DATE_FORMAT(CONVERT_TZ(b.created_at, '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s') AS created_at,
                     DATE_FORMAT(CONVERT_TZ(b.updated_at, '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s') AS updated_at,
                     -- 关联账本信息
                     bo.name                                                                        AS book_name,
                     bo.is_default                                                                  AS book_is_default
                 FROM mate_budget b
                          LEFT JOIN mate_book bo ON b.book_id = bo.id
                 WHERE b.id = ?
                   AND b.user_id = ? AND b.amount>0 LIMIT 1`,
                [budgetId, userId]
            );

            // 3. 无数据处理
            if (!rows || (rows as any[]).length === 0) {
                // return {
                //     code: 404,
                //     data: {},
                //     message: "预算不存在或不属于当前用户"
                // };
                return {
                    code: 200,
                    data: {
                        remaining_amount: "0.00",
                        remaining_percent: 100,
                        amount: "0.00",
                        remaining_daily_amount: 0,
                        surplus_amount: "0.00"
                    },
                    message: "查询预算详情成功"
                }
            }

            // 4. 数据重组 + 每日可消费金额计算
            const budget = (rows as any[])[0];
            // 核心计算逻辑
            const calculateDailyAvailable = () => {
                // 4.1 获取预算的年/月（若无则用当前年月）
                const budgetYear = budget.year || new Date().getFullYear();
                const budgetMonth = budget.month || (new Date().getMonth() + 1); // 月份从1开始

                // 4.2 计算当月总天数
                const totalDaysOfMonth = new Date(budgetYear, budgetMonth, 0).getDate();

                // 4.3 获取当前日期（日期数，如11号则为11）
                const currentDay = new Date().getDate();

                // 4.4 计算当月剩余天数（总天数 - 当前日期）
                const remainingDays = Math.max(totalDaysOfMonth - currentDay, 0); // 避免负数

                // 4.5 计算剩余预算金额
                const surplusAmount = parseFloat((budget.amount - (budget.actual_amount || 0)).toFixed(2));

                // 4.6 计算每日可消费金额（剩余金额 ÷ 剩余天数，无剩余天数则为0）
                let dailyAvailable = 0;
                if (remainingDays > 0 && surplusAmount > 0) {
                    dailyAvailable = parseFloat((surplusAmount / remainingDays).toFixed(2));
                }

                return {
                    total_days_of_month: totalDaysOfMonth, // 当月总天数
                    current_day: currentDay, // 当前日期
                    remaining_days: remainingDays, // 当月剩余天数
                    daily_available: dailyAvailable // 每日可消费金额
                };
            };

            // 执行计算
            const dailyConsumeData = calculateDailyAvailable();
            let categories = await this.getBudgetCategoryList(userId, bookId, budgetId)
            // 格式化最终返回数据
            const formattedData = {
                id: budget.id,
                amount: budget.amount, // 预算总金额
                actual_amount: budget.actual_amount || 0, // 已使用金额
                surplus_amount: (budget.amount - (budget.actual_amount || 0)).toFixed(2), // 剩余金额
                remaining_percent: budget.remaining_percent, // 剩余百分比
                created_at: budget.created_at,
                updated_at: budget.updated_at,
                // 新增每日可消费相关计算结果
                ...dailyConsumeData,
                // 账本信息
                book: {
                    name: budget.book_name || "默认账本",
                    is_default: budget.book_is_default || 0
                },
                categories
            };

            // 5. 成功返回
            return {
                code: 200,
                data: formattedData,
                message: "查询预算详情成功"
            };

        } catch (error: any) {
            console.error("查询预算详情失败：", error.message, {userId, budgetId});
            // 异常返回
            return {
                code: 500,
                data: {},
                message: `查询失败：${error.message || "服务器内部错误"}`
            };
        }
    }

//
    async getBudgetCategoryList(userId: number, bookId: number, budgetId: number) {
        try {
            // 构建格式化后的SQL语句（新增剩余金额字段）
            let querySql = `
                SELECT id,
                       user_id,
                       book_id,
                       budget_id,
                       -- 剩余百分比：正数 + 强制两位小数（补零），返回字符串格式（前端展示友好）
                       FORMAT(ROUND((IFNULL(remaining_percent, 0)), 2), 2)             AS remaining_percent,
                       -- 新增：剩余金额 = 预算金额 - 实际支出金额（非负处理，空值默认0）
                       IFNULL(ROUND((category_amount - category_actual_amount), 2), 0) AS remaining_amount,
                       -- 日期格式化
                       DATE_FORMAT(IFNULL(created_at, ''), '%Y-%m-%d %H:%i:%s')        AS created_at,
                       DATE_FORMAT(IFNULL(updated_at, ''), '%Y-%m-%d %H:%i:%s')        AS updated_at,
                       -- 基础业务字段
                       category_id,
                       category_name,
                       category_amount,
                       category_actual_amount,
                       sort_order,
                       is_active
                FROM ${this.budgetCategoryTableName}
                WHERE user_id = ?
                  AND book_id = ?
                  AND budget_id = ?
                AND category_amount>0
            `;
            let queryParams = [userId, bookId, budgetId];

            // 执行查询
            const [rows] = await pool.execute(querySql, queryParams);
            // @ts-ignore
            rows.forEach((item) => {item.status=true})
            return rows; // 直接返回SQL格式化后的结果，包含剩余金额字段
        } catch (error) {
            console.error('查询预算分类失败：', error);
            return [];
        }
    }
}

export default new BillModule();