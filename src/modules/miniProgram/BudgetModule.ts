import dayjs from "dayjs";
import pool from "../../db";
import HttpError from "../../utils/HttpError";
import type {BudgetDbSchema, UserDbSchema} from "../../types";
import CategoryModule from "./CategoryModule";
// @ts-ignore
import {getWeekOfYear} from "../../utils/dateUtils";
import  {formatDate} from '../../utils/date'
type CycleType = "day" | "week" | "month" | "year" | "custom";

class BillModule {
    budgetTableName = "mate_budget";
    billTableName = "mate_bill";
    budgetCategoryTableName = "mate_budget_category";

    /**
     * 按 cycle_type 判断预算是否唯一
     * @returns boolean：true=唯一，false=重复
     * @param user_id
     * @param book_id
     * @param cycle_type
     * @param cycle_start
     * @param cycle_end
     */
    async isBudgetUniqueByCycleType(
        user_id: number,
        book_id: number,
        cycle_type: "day" | "week" | "month" | "year" | "custom",
        cycle_start: string,
        cycle_end: string
    ): Promise<boolean> {
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
    private async calculateActualExpense(
        user_id: number,
        book_id: number,
        cycle_start: string,
        cycle_end: string
    ): Promise<number> {
        // 校验日期格式（和 getActualAmount 保持一致）
        const dateReg = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateReg.test(cycle_start) || !dateReg.test(cycle_end)) {
            throw new HttpError("日期格式错误：请传入 YYYY-MM-DD 格式的日期", 400);
        }
        if (new Date(cycle_start) > new Date(cycle_end)) {
            throw new HttpError("日期错误：开始日期不能晚于结束日期", 400);
        }

        // 强制转换参数类型，避免数字/字符串不匹配
        const userId = Number(user_id);
        const bookId = Number(book_id);

        try {
            // 查询支出总金额（核心修复：日期范围逻辑 + 金额类型强转 + 参数化type/is_deleted）
            const [rows] = await pool.execute(
                `SELECT IFNULL(SUM(CAST(amount AS DECIMAL(10,2))), 0) AS total_expense
             FROM ${this.billTableName}
             WHERE user_id = ?
               AND book_id = ?
               AND type = ? -- 参数化，避免类型不匹配
               AND is_deleted = ? -- 参数化，避免类型不匹配
               -- 修复：替换 BETWEEN，用 >= + < 结束日+1天，覆盖结束日全天数据
               AND bill_time >= ?  
               AND bill_time < DATE_ADD(?, INTERVAL 1 DAY)`,
                [
                    userId,
                    bookId,
                    2, // 支出类型（如果数据库存字符串则改为 '2'）
                    0, // 未删除（如果数据库存字符串则改为 '0'）
                    cycle_start,
                    cycle_end
                ]
            );

            // 安全处理数值
            const resultRows = rows as Array<{ total_expense: number | string }>;
            const rawTotal = resultRows[0]?.total_expense ?? 0;
            const totalExpense = Number(rawTotal);
            const fixedTotal = Math.round(totalExpense * 100) / 100; // 保留2位小数

            // 可选：调试日志，便于排查问题
            // console.log("【总支出计算】", {
            //     参数: { userId, bookId, cycle_start, cycle_end },
            //     原始金额: rawTotal,
            //     格式化后: fixedTotal
            // });

            return fixedTotal;
        } catch (error) {
            console.error("计算总支出失败：", error);
            throw new HttpError("计算总支出失败", 500);
        }
    }

    /**
     * 创建预算（基于 cycle_type 校验唯一性，创建后自动计算并更新实际支出）
     */
    /**
     * 创建预算（基于 cycle_type 校验唯一性，创建后自动计算并更新实际支出）
     */
    async create(
        budgetData: BudgetDbSchema
    ): Promise<{
        budget_id: number;
        actual_amount: number;
        category_bill_count: number;
        message: string;
    }> {
        // 提前统一计算周期结束时间（避免多处计算不一致）
        const cycleEnd =
            budgetData.cycle_end ||
            this.getCycleEndByType(budgetData.cycle_type, budgetData.cycle_start);

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
        // 存储有效分类ID（用于后续更新is_deleted）
        let validCategoryIds: number[] = [];

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
                        cycleEnd, // 统一cycleEnd
                    ]
                );
                budgetId = (existBudget as any)[0]?.id;
                if (!budgetId || !Number.isInteger(budgetId) || budgetId <= 0) {
                    throw new HttpError(
                        `未找到${budgetData.cycle_type}周期的预算记录`,
                        404
                    );
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
                        budgetId,
                    ]
                );
                isUpdate = true;
            } catch (error: any) {
                throw new HttpError(
                    `更新${budgetData.cycle_type}周期预算失败：${error.message}`,
                    500
                );
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
                        0.0, // 初始值后续更新
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
                    throw new HttpError(
                        `创建失败：${budgetData.cycle_type}周期预算已存在`,
                        403
                    );
                }
                throw new HttpError(`创建预算失败：${error.message}`, 500);
            }
        }

        // 4. 处理分类预算（新增/更新）+ 计算分类实际支出
        if (
            budgetData.categories &&
            Array.isArray(budgetData.categories) &&
            budgetData.categories.length > 0
        ) {
            const categories = budgetData.categories as unknown as Array<{
                category_id: number | string;
                category_amount: number;
                category_name?: string;
            }>;

            // ===== 核心修复1：前置校验分类ID有效性 =====
            // 4.1 过滤并校验分类ID（必须是正整数且存在于mate_category表）
            const validCategories = [];
            for (const item of categories) {
                const categoryId = Number(item.category_id);
                if (!Number.isInteger(categoryId) || categoryId <= 0) {
                    console.warn(`跳过非法分类ID：${item.category_id}（非正整数）`);
                    continue;
                }
                // 数据库校验：检查分类ID是否存在于mate_category表
                try {
                    const [categoryExist] = await pool.execute(
                        `SELECT id FROM mate_category WHERE id = ? LIMIT 1`,
                        [categoryId] // 增加用户维度校验，避免跨用户分类
                    );
                    if ((categoryExist as any).length === 0) {
                        console.warn(`跳过不存在的分类ID：${categoryId}（用户${budgetData.user_id}）`);
                        continue;
                    }
                } catch (error: any) {
                    console.error(`校验分类ID${categoryId}失败：${error.message}`);
                    continue;
                }
                validCategories.push({
                    ...item,
                    category_id: categoryId // 确保是数字类型
                });
                // 收集有效分类ID（用于后续更新is_deleted）
                validCategoryIds.push(categoryId);
            }
            if (validCategories.length === 0) {
                console.warn("无有效分类预算数据，跳过分类预算处理");
            } else {
                // 4.2 构建合法的分类预算参数
                const categoryParams = validCategories.map((item) => [
                    budgetData.user_id,
                    budgetData.book_id,
                    budgetId,
                    item.category_id, // 已校验的合法ID
                    item.category_name || '',
                    item.category_amount,
                    Number(budgetData.sort_order) || 99,
                    budgetData.is_active || 1,
                    new Date(),
                    new Date(),
                ]);

                try {
                    // 4.3 批量UPSERT分类预算（仅处理合法分类）
                    const [categoryResult] = await pool.execute(
                        `INSERT INTO ${this.budgetCategoryTableName}
                         (user_id, book_id, budget_id, category_id, category_name, category_amount, sort_order, is_active,
                          created_at, updated_at)
                         VALUES ${categoryParams.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",")}
                             ON DUPLICATE KEY UPDATE
                                                  category_name = VALUES(category_name),
                                                  category_amount = VALUES(category_amount),
                                                  sort_order = VALUES(sort_order),
                                                  is_active = VALUES(is_active),
                                                  updated_at = VALUES(updated_at)`,
                        categoryParams.flat()
                    );
                    categoryCount = (categoryResult as any).affectedRows;
                    // 4.4 计算并更新分类实际支出金额
                    for (const item of validCategories) {
                        const categoryId = item.category_id as number;
                        const categoryName = item.category_name;
                        const categoryActualAmount =
                            await this.calculateCategoryActualExpense(
                                Number(budgetData.user_id),
                                Number(budgetData.book_id),
                                budgetData.cycle_start,
                                cycleEnd,
                                categoryId
                            );

                        // 更新分类实际支出
                        await pool.execute(
                            `UPDATE ${this.budgetCategoryTableName}
                             SET category_actual_amount = ?,
                                 remaining_percent      = IF(
                                         category_amount = 0,
                                         0,
                                         ROUND(((category_amount - ?) / category_amount) * 100, 2)
                                                          ),
                                 updated_at             = NOW()
                             WHERE budget_id = ?
                               AND category_id = ?`,
                            [categoryActualAmount, categoryActualAmount, budgetId, categoryId]
                        );
                        console.log(
                            `分类[ID:${categoryId}${categoryName ? `(${categoryName})` : ''}] 实际支出更新为：${categoryActualAmount}元`
                        );
                    }
                } catch (error: any) {
                    // 精准捕获外键错误
                    if (error.code === "ER_NO_REFERENCED_ROW_2" || error.message.includes("foreign key constraint")) {
                        throw new HttpError(`处理分类预算失败：分类ID不存在或无权限`, 400);
                    }
                    throw new HttpError(`处理分类预算失败：${error.message}`, 500);
                }
            }
        }

        // 5. 计算主预算实际支出（增加异常捕获和数值校验）
        let actualAmount = 0.0;
        try {
            actualAmount = await this.calculateActualExpense(
                budgetData.user_id,
                budgetData.book_id,
                budgetData.cycle_start,
                cycleEnd // 统一cycleEnd
            );
            // 校验实际支出数值有效性
            if (!Number.isFinite(actualAmount) || actualAmount < 0) {
                actualAmount = 0.0;
                console.warn("计算的实际支出金额异常，重置为0.00");
            }
        } catch (error: any) {
            console.error(
                `计算${budgetData.cycle_type}周期支出金额失败：`,
                error.message
            );
            actualAmount = 0.0; // 兜底赋值
        }

        console.log("更新主预算参数：", {
            budgetId,
            actualAmount,
            budgetIdValid: Number.isInteger(budgetId) && budgetId > 0,
            actualAmountValid: actualAmount >= 0,
        });

        // 6. 更新主预算实际支出（核心修复：增加强校验+错误捕获+日志）
        if (Number.isInteger(budgetId) && budgetId > 0 && actualAmount >= 0) {
            try {
                const [updateResult] = await pool.execute(
                    `UPDATE ${this.budgetTableName}
                     SET actual_amount     = ?,
                         remaining_percent = IF(
                                 amount = 0,
                                 0,
                                 ROUND(((amount - ?) / amount) * 100, 2)
                                             ),
                         updated_at        = NOW()
                     WHERE id = ?`,
                    [actualAmount, actualAmount, budgetId]
                );
                // 检查更新是否生效
                const affectedRows = (updateResult as any).affectedRows;
                console.log(affectedRows, 213);
                if (affectedRows === 0) {
                    console.error(
                        `更新主预算实际支出失败：预算ID ${budgetId} 不存在或金额未变化`,
                        {
                            budgetId,
                            actualAmount,
                            affectedRows,
                        }
                    );
                } else {
                    console.log(
                        `主预算ID ${budgetId} 实际支出更新成功：${actualAmount}元`
                    );

                    // ===== 新增核心逻辑：更新分类预算的is_deleted为0 =====
                    if (validCategoryIds.length > 0) {
                        try {
                            // 批量更新对应分类预算的is_deleted为0
                            const [deleteUpdateResult] = await pool.execute(
                                `UPDATE ${this.budgetCategoryTableName}
                             SET is_deleted = 0,
                                 updated_at = NOW()
                             WHERE budget_id = ?
                               AND category_id IN (${validCategoryIds.map(() => '?').join(',')})`,
                                [budgetId, ...validCategoryIds] // 参数：预算ID + 所有有效分类ID
                            );
                            const deleteAffectedRows = (deleteUpdateResult as any).affectedRows;
                            console.log(
                                `分类预算is_deleted更新成功：预算ID ${budgetId}，分类ID列表 ${validCategoryIds.join(',')}，影响行数 ${deleteAffectedRows}`
                            );
                        } catch (error: any) {
                            console.error(
                                `更新分类预算is_deleted失败：预算ID ${budgetId}，分类ID列表 ${validCategoryIds.join(',')}`,
                                error.message
                            );
                            // 此处可选择抛出错误或仅日志（根据业务是否强依赖）
                            // throw new HttpError(`更新分类预算删除状态失败：${error.message}`, 500);
                        }
                    }
                }
            } catch (error: any) {
                console.error(`更新主预算实际支出SQL执行失败：`, error.message, {
                    budgetId,
                    actualAmount,
                    sql: `UPDATE ${this.budgetTableName}
                          SET actual_amount = ${actualAmount}
                          WHERE id = ${budgetId}`,
                });
                throw new HttpError(`更新预算实际支出失败：${error.message}`, 500);
            }
        } else {
            console.error("更新主预算条件不满足：", {
                budgetId,
                actualAmount,
                budgetIdValid: Number.isInteger(budgetId) && budgetId > 0,
                actualAmountValid: actualAmount >= 0,
            });
        }

        // 7. 返回结果
        const baseMessage = isUpdate
            ? `${budgetData.cycle_type}周期预算更新成功`
            : `${budgetData.cycle_type}周期预算创建成功`;
        const message =
            categoryCount > 0
                ? `${baseMessage}，处理分类预算账单${categoryCount}笔，当前实际支出：${actualAmount}元`
                : `${baseMessage}，当前实际支出：${actualAmount}元`;

        return {
            budget_id: budgetId || 0,
            actual_amount: actualAmount,
            category_bill_count: categoryCount,
            message: message,
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
    private async calculateCategoryActualExpense(
        user_id: number,
        book_id: number,
        cycle_start: string,
        cycle_end: string,
        category_id: number
    ): Promise<number> {
        // 校验日期格式
        const dateReg = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateReg.test(cycle_start) || !dateReg.test(cycle_end)) {
            throw new HttpError("日期格式错误：请传入 YYYY-MM-DD 格式的日期", 400);
        }
        if (new Date(cycle_start) > new Date(cycle_end)) {
            throw new HttpError("日期错误：开始日期不能晚于结束日期", 400);
        }

        try {
            // 核心：不拼接时间，直接用日期 + >= / < 逻辑
            const [rows] = await pool.execute(
                `SELECT IFNULL(SUM(CAST(amount AS DECIMAL(10,2))), 0) AS total_expense
             FROM ${this.billTableName}
             WHERE user_id = ?
               AND book_id = ?
               AND type = ?        -- 用参数避免类型不匹配
               AND is_deleted = ?  -- 用参数避免类型不匹配
               AND category_id = ?
               -- 关键：覆盖开始日全天 + 结束日全天，无精度问题
               AND bill_time >= ?  
               AND bill_time < DATE_ADD(?, INTERVAL 1 DAY)`,
                [
                    Number(user_id),
                    Number(book_id),
                    '2',          // 按数据库实际存储类型传（字符串/数字）
                    '0',          // 按数据库实际存储类型传（字符串/数字）
                    Number(category_id),
                    cycle_start,  // 直接传 2025-12-01，数据库会自动补 00:00:00
                    cycle_end     // 直接传 2025-12-31，DATE_ADD 后是 2026-01-01
                ]
            );

            // 调试日志（保留）
            const resultRows = rows as Array<{ total_expense: number | string }>;
            console.log("【调试】SQL结果：", resultRows[0]);

            // 格式化金额
            const rawTotal = resultRows[0]?.total_expense ?? 0;
            const totalExpense = Number(rawTotal);
            return Math.round(totalExpense * 100) / 100;
        } catch (error) {
            console.error("计算支出失败：", error);
            throw new HttpError("计算支出失败", 500);
        }
    }

    // 原有辅助方法保留
    private getCycleEndByType(cycleType: string, cycleStart: string): string {
        switch (cycleType) {
            case "day":
                return cycleStart;
            case "week":
                const {sunday} = this.getWeekRange(
                    dayjs(cycleStart).year(),
                    getWeekOfYear(cycleStart).week
                );
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
    async findById(
        user_id: number,
        book_id: number,
        budget_id: number
    ): Promise<boolean> {
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
    private getWeekRange(
        year: number,
        week: number
    ): { monday: string; sunday: string } {
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

        const format = (date: Date) => dayjs(date).format("YYYY-MM-DD");
        return {
            monday: format(targetMonday),
            sunday: format(targetSunday),
        };
    }

    /**
     * 预算详情
     * @param userId
     * @param bookId
     */
    async info(userId: number, bookId: number): Promise<any> {
        // 1. 基础参数校验（提前校验，避免无效查询）
        if (!userId || userId <= 0) {
            return {
                code: 400,
                data: {},
                message: "用户ID必须为正整数",
            };
        }
        if (!bookId || bookId <= 0) {
            return {
                code: 400,
                data: {},
                message: "账本ID必须为正整数",
            };
        }

        // ===== 核心逻辑1：获取已删除的分类列表并提取ID =====
        let categoryDelList = await CategoryModule.categoryaDeleteList(userId, 1, 100, 2, 1);
        // console.log("已删除分类列表：", categoryDelList);

        // 提取已删除分类的ID数组（去重+校验）
        const deletedCategoryIds:any = [];
        if (categoryDelList && Array.isArray(categoryDelList.list)) {
            // @ts-ignore
            categoryDelList.list.forEach(item => {
                const catId = Number(item.id);
                if (Number.isInteger(catId) && catId > 0) {
                    deletedCategoryIds.push(catId);
                }
            });
        }
        console.log("已删除分类ID数组：", JSON.stringify(deletedCategoryIds));

        // 2. 查询基础预算信息
        const [budgetRows] = await pool.execute(
            `SELECT id, cycle_start, cycle_end, amount, cycle_type
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
                    surplus_amount: "0.00",
                },
                message: "查询预算详情成功",
            };
        }

        // @ts-ignore
        let budgetId = budgetInfo.id as number;
        const { cycle_start, cycle_end, amount, cycle_type } = budgetInfo;

        try {
            if (!budgetId || budgetId <= 0) {
                return {
                    code: 400,
                    data: {},
                    message: "预算ID必须为正整数",
                };
            }

            // ===== 核心逻辑2：清空已删除分类的预算金额为0 =====
            if (deletedCategoryIds.length > 0) {
                try {
                    await pool.execute(
                        `UPDATE ${this.budgetCategoryTableName}
                     SET category_amount = 0,
                         category_actual_amount = 0,
                         remaining_percent = 0,
                         updated_at = NOW()
                     WHERE budget_id = ?
                       AND user_id = ?
                       AND category_id IN (${deletedCategoryIds.map(() => '?').join(',')})`,
                        [budgetId, userId, ...deletedCategoryIds]
                    );
                    console.log(`已清空预算ID ${budgetId} 下已删除分类(${deletedCategoryIds.join(',')})的预算金额`);
                } catch (error: any) {
                    console.error(`清空已删除分类预算失败：${error.message}`, { budgetId, deletedCategoryIds });
                    // 非致命错误，不中断流程
                }
            }

            // 3. 查询指定周期内类型为2的账单总金额
            // const [billRows] = await pool.execute(
            //     `SELECT IFNULL(SUM(amount), 0) AS total_amount
            //  FROM mate_bill
            //  WHERE user_id = ?
            //    AND book_id = ?
            //    AND type = 2
            //    AND is_deleted = 0
            //    AND bill_time BETWEEN ? AND ?`,
            //
            //     [userId, bookId, cycle_start, cycle_end]
            // );
            const [billRows] = await pool.execute(
                `SELECT IFNULL(SUM(CAST(amount AS DECIMAL(10,2))), 0) AS total_expense
             FROM ${this.billTableName}
             WHERE user_id = ?
               AND book_id = ?
               AND type = ?        -- 用参数避免类型不匹配
               AND is_deleted = ?  -- 用参数避免类型不匹配
               -- 关键：覆盖开始日全天 + 结束日全天，无精度问题
               AND bill_time >= ?  
               AND bill_time < DATE_ADD(?, INTERVAL 1 DAY)`,
                [
                    Number(userId),
                    Number(bookId),
                    '2',          // 按数据库实际存储类型传（字符串/数字）
                    '0',          // 按数据库实际存储类型传（字符串/数字）
                    cycle_start,  // 直接传 2025-12-01，数据库会自动补 00:00:00
                    cycle_end     // 直接传 2025-12-31，DATE_ADD 后是 2026-01-01
                ]
            );
            // // 计算实际使用金额（保留2位小数）
            console.log("【调试】SQL结果：", billRows as any[]);
            const actualAmount = parseFloat((billRows as any[])[0].total_expense || 0).toFixed(2);
            console.log(actualAmount,"主预算表消费金额")
            //
            // // 4. 更新预算表中的actual_amount字段
            await pool.execute(
                `UPDATE ${this.budgetTableName}
             SET actual_amount = ?,
                 remaining_percent = ROUND((1 - (? / IF(amount = 0, 1, amount))) * 100, 2)
             WHERE id = ? AND user_id = ?`,
                [actualAmount, actualAmount, budgetId, userId]
            );

            // 5. 查询预算详情（关联账本，格式化日期）
            const [rows] = await pool.execute(
                `SELECT
             -- 预算核心字段
             b.id,
             b.user_id,
             b.book_id,
             b.amount,
             b.actual_amount,
             b.remaining_percent,
             b.cycle_start,
             b.cycle_end,
             b.cycle_type,
             -- 日期格式化：UTC→东八区
             DATE_FORMAT(CONVERT_TZ(b.created_at, '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s') AS created_at,
             DATE_FORMAT(CONVERT_TZ(b.updated_at, '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s') AS updated_at,
             -- 关联账本信息
             bo.name AS book_name,
             bo.is_default AS book_is_default
         FROM mate_budget b
                  LEFT JOIN mate_book bo ON b.book_id = bo.id
         WHERE b.id = ?
           AND b.user_id = ?
           AND b.amount > 0 LIMIT 1`,
                [budgetId, userId]
            );

            // 6. 无数据处理
            if (!rows || (rows as any[]).length === 0) {
                return {
                    code: 200,
                    data: {
                        remaining_amount: "0.00",
                        remaining_percent: 100,
                        amount: "0.00",
                        remaining_daily_amount: 0,
                        surplus_amount: "0.00",
                    },
                    message: "查询预算详情成功",
                };
            }

            // 7. 数据重组 + 每日可消费金额计算
            const budget = (rows as any[])[0];

            // 核心计算逻辑 - 适配年/月周期
            const calculateDailyAvailable = () => {
                // 解析周期开始/结束时间
                const cycleStart = new Date(budget.cycle_start);
                const cycleEnd = new Date(budget.cycle_end);
                const now = new Date();

                // 确保时间对象有效
                if (isNaN(cycleStart.getTime()) || isNaN(cycleEnd.getTime())) {
                    return {
                        total_days_of_cycle: 0,
                        current_day_in_cycle: 0,
                        remaining_days: 0,
                        daily_available: 0,
                        cycle_type: budget.cycle_type || 'month'
                    };
                }

                // 计算周期总天数
                const totalDaysOfCycle = Math.ceil((cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

                // 计算当前已过天数
                const passedDays = now < cycleStart
                    ? 0
                    : now > cycleEnd
                        ? totalDaysOfCycle
                        : Math.ceil((now.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

                // 计算剩余天数
                const remainingDays = Math.max(totalDaysOfCycle - passedDays, 0);

                // 计算剩余预算金额
                const surplusAmount = parseFloat(
                    (budget.amount - (budget.actual_amount || 0)).toFixed(2)
                );

                // 计算每日可消费金额
                let dailyAvailable = 0;
                if (remainingDays > 0 && surplusAmount > 0) {
                    dailyAvailable = parseFloat(
                        (surplusAmount / remainingDays).toFixed(2)
                    );
                }

                // 补充周期类型相关的额外信息
                let cycleInfo = {};
                if (budget.cycle_type === 'year') {
                    // 年度预算额外信息
                    const year = cycleStart.getFullYear();
                    cycleInfo = {
                        year,
                        total_days_of_year: totalDaysOfCycle,
                        passed_days_in_year: passedDays
                    };
                } else if (budget.cycle_type === 'month') {
                    // 月度预算额外信息
                    const year = cycleStart.getFullYear();
                    const month = cycleStart.getMonth() + 1;
                    cycleInfo = {
                        year,
                        month,
                        total_days_of_month: totalDaysOfCycle,
                        passed_days_in_month: passedDays
                    };
                }

                return {
                    total_days_of_cycle: totalDaysOfCycle, // 周期总天数
                    current_day_in_cycle: passedDays, // 周期内已过天数
                    remaining_days: remainingDays, // 周期剩余天数
                    daily_available: dailyAvailable, // 每日可消费金额
                    cycle_type: budget.cycle_type || 'month', // 周期类型
                    ...cycleInfo
                };
            };

            // 执行计算
            const dailyConsumeData = calculateDailyAvailable();
            // 查询分类预算列表（已包含清空后的0金额数据）
            let categories = await this.getBudgetCategoryList(
                userId,
                bookId,
                budgetId,
            );

            // 格式化最终返回数据（移除重复的cycle_type定义）
            const formattedData = {
                id: budget.id,
                amount: budget.amount, // 预算总金额
                actual_amount: parseFloat(budget.actual_amount || 0).toFixed(2), // 已使用金额（格式化）
                surplus_amount: (budget.amount - (budget.actual_amount || 0)).toFixed(2), // 剩余金额
                remaining_percent: parseFloat(budget.remaining_percent || 100).toFixed(2), // 剩余百分比
                cycle_start: budget.cycle_start, // 预算周期开始时间
                cycle_end: budget.cycle_end, // 预算周期结束时间
                // 移除重复的cycle_type定义 ← 关键修复点
                created_at: budget.created_at,
                updated_at: budget.updated_at,
                // 新增每日可消费相关计算结果（包含cycle_type）
                ...dailyConsumeData,
                // 账本信息
                book: {
                    name: budget.book_name || "默认账本",
                    is_default: budget.book_is_default || 0,
                },
                categories,
            };

            // 8. 成功返回
            return {
                code: 200,
                data: formattedData,
                message: "查询预算详情成功",
            };
        } catch (error: any) {
            console.error("查询预算详情失败：", error.message, { userId, budgetId, bookId });
            // 异常返回
            return {
                code: 500,
                data: {},
                message: `查询失败：${error.message || "服务器内部错误"}`,
            };
        }
    }
    //
    async getBudgetCategoryList(
        userId: number,
        bookId: number,
        budgetId: number
    ) {
        try {

            const [budgetRow] = await pool.execute(
                `SELECT
                     DATE_FORMAT(b.cycle_start, '%Y-%m-%d') AS cycleStart,
                     DATE_FORMAT(b.cycle_end, '%Y-%m-%d') AS cycleEnd
                 FROM ${this.budgetTableName} b
                 WHERE b.id = ?
                     LIMIT 1`,
                [budgetId]
            );
          let   budgetInfo =   (budgetRow as any[])[0];
          console.log(budgetInfo)
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
                  AND is_deleted = 0
                  AND category_amount > 0
            `;
            let queryParams = [userId, bookId, budgetId];

            // 执行查询
            const [rows] = await pool.execute(querySql, queryParams);
            console.log(budgetInfo)
            // @ts-ignore
            for (const item of rows) {
                item.status = true
                const categoryId = item.category_id as number;
                const categoryName = item.category_name;
                const categoryActualAmount =
                    await this.calculateCategoryActualExpense(
                        Number(userId),
                        Number(bookId),
                        (budgetInfo.cycleStart),
                (budgetInfo.cycleEnd),
                        categoryId
                    );

                // 更新分类实际支出
                await pool.execute(
                    `UPDATE ${this.budgetCategoryTableName}
                             SET category_actual_amount = ?,
                                 remaining_percent      = IF(
                                         category_amount = 0,
                                         0,
                                         ROUND(((category_amount - ?) / category_amount) * 100, 2)
                                                          ),
                                 updated_at             = NOW()
                             WHERE budget_id = ?
                               AND category_id = ?`,
                    [categoryActualAmount, categoryActualAmount, budgetId, categoryId]
                );
                console.log(
                    `分类[ID:${categoryId}${categoryName ? `(${categoryName})` : ''}] 实际支出更新为：${categoryActualAmount}元`
                );
            }

            // rows.forEach((item) => {
            //     item.status = true;
            // });
            return rows; // 直接返回SQL格式化后的结果，包含剩余金额字段
        } catch (error) {
            console.error("查询预算分类失败：", error);
            return [];
        }
    }
}

export default new BillModule();
