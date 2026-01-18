import pool from "../../db";
import type {
    UserDbSchema,
    BillDbSchema,
    ApiResponse,
    PaginationData,
} from "../../types";
import { v4 as uuidv4 } from "uuid";
import dayjs from "dayjs";
import { formatAmount, parseJsonToArray } from "../../utils/tools";
import HttpError from "../../utils/HttpError";
import userModule from "./UserModule";
import pointModule from "./PointModule";

class BillModule {
    private billTableName = "mate_bill";
    private categoryTableName = "mate_category";
    private budgetTableName = "mate_budget";
    private budgetCategoryTableName = "mate_budget_category";
    private categoryUserSortTableName = 'mate_category_user_sort';

    /**
     * 创建/更新账单（同步更新账户金额+记录账户流水，允许账户金额为负数，account_id 非必传）
     * @param params 账单参数
     */
    async create(params: BillDbSchema): Promise<string | undefined> {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const baseData = {
                uuid: params.uuid || uuidv4(),
                user_id: params.user_id,
                book_id: params.book_id,
                account_id: params.account_id || null, // 明确处理空值，赋值为 null
                consume_user_id: params.consume_user_id,
                category_id: params.category_id,
                image_list: params.image_list,
                address:params.address||null,
                latitude:params.latitude||null,
                longitude:params.longitude||null,
                amount: params.amount,
                remark: params.remark || "",
                type: params.type, // 2=支出，1=收入
                currency: params.currency || "CNY",
                bill_time: params.bill_time,
                tags: params.tags || null,
                updated_at: new Date(),
                created_at: params.created_at || new Date(),
            };
            console.log(baseData)
            let affectedRows = 0;
            let insertId = 0;
            let originalBill: any = null;

            if (params.billId) {
                // 查询原账单（用于回滚账户金额）
                const [originResult] = await connection.execute(
                    `SELECT id, account_id, amount, type FROM ${this.billTableName} WHERE id=? AND user_id=?`,
                    [params.billId, baseData.user_id]
                );
                originalBill = (originResult as any[])[0];
                if (!originalBill) {
                    throw new Error(`账单ID ${params.billId} 不存在，更新失败`);
                }

                // 执行账单更新
                const [result] = await connection.execute(
                    `UPDATE ${this.billTableName}
                     SET user_id=?, book_id=?,account_id=?, consume_user_id=?, category_id=?, image_list=?,
                         amount=?, remark=?, type=?, currency=?, bill_time=?, tags=?, updated_at=?, address=?, longitude=?, latitude=?
                     WHERE id=? AND user_id=?`,
                    [
                        baseData.user_id,
                        baseData.book_id,
                        baseData.account_id, // 允许传入 null
                        baseData.consume_user_id,
                        baseData.category_id,
                        baseData.image_list,
                        baseData.amount,
                        baseData.remark,
                        baseData.type,
                        baseData.currency,
                        baseData.bill_time,
                        baseData.tags,
                        baseData.updated_at,
                        baseData.address,
                        baseData.longitude,
                        baseData.latitude,
                        params.billId,

                        baseData.user_id
                    ]
                );
                const updateResult = result as { affectedRows: number };
                affectedRows = updateResult.affectedRows;

                if (affectedRows === 0) {
                    throw new Error(`账单ID ${params.billId} 不存在，更新失败`);
                }

                // 回滚原账单账户金额 + 记录回滚流水（仅当原账单有 account_id 时执行）
                if (originalBill.account_id) {
                    await this.syncAccountAmount(
                        originalBill.account_id,
                        originalBill.amount,
                        originalBill.type === 1 ? 2 : 1, // 反向操作：原收入→扣减，原支出→加回
                        connection,
                        baseData.user_id,
                        params.billId,
                        originalBill.type === 1 ? 3 : 4, // 3=回滚收入，4=回滚支出
                        `更新账单回滚原${originalBill.type === 1 ? "收入" : "支出"}金额`
                    );
                }

                // 应用新账单账户金额 + 记录新流水（仅当新账单有 account_id 时执行）
                if (baseData.account_id) {
                    await this.syncAccountAmount(
                        baseData.account_id,
                        baseData.amount,
                        baseData.type,
                        connection,
                        baseData.user_id,
                        params.billId,
                        baseData.type, // 1=收入，2=支出
                        `更新账单${baseData.type === 1 ? "收入" : "支出"}`
                    );
                }
            } else {
                // 新增账单逻辑
                const [result] = await connection.execute(
                    `INSERT INTO ${this.billTableName}
                     (uuid, user_id, book_id,account_id, category_id, consume_user_id, amount, type, currency, bill_time, tags, remark,
                      created_at, updated_at, image_list,address,latitude,longitude)
                     VALUES (?, ?, ?, ?, ?, ?,?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,?)`,
                    [
                        baseData.uuid,
                        baseData.user_id,
                        baseData.book_id,
                        baseData.account_id, // 允许传入 null
                        baseData.category_id,
                        baseData.consume_user_id,
                        baseData.amount,
                        baseData.type,
                        baseData.currency,
                        baseData.bill_time,
                        baseData.tags,
                        baseData.remark,
                        baseData.created_at,
                        baseData.updated_at,
                        baseData.image_list,
                        baseData.address,
                        baseData.latitude,
                        baseData.longitude,
                    ]
                );
                const insertResult = result as { affectedRows: number; insertId: number };
                affectedRows = insertResult.affectedRows;
                insertId = insertResult.insertId;

                // 新增时同步更新账户金额 + 记录流水（仅当有 account_id 时执行）
                if (affectedRows === 1 && baseData.account_id) {
                    await this.syncAccountAmount(
                        baseData.account_id,
                        baseData.amount,
                        baseData.type,
                        connection,
                        baseData.user_id,
                        insertId, // 新增账单的ID
                        baseData.type, // 正常变动类型：1=收入，2=支出
                        `新增账单${baseData.type === 1 ? "收入" : "支出"}`
                    );
                }

                // 新增时发放经验和积分（无论是否有 account_id 都执行）
                if (affectedRows === 1) {
                    await userModule.addBillExp(baseData.user_id, insertId);
                    await pointModule.addPoints(
                        baseData.user_id,
                        1,
                        "bill_add",
                        "新增账单奖励积分",
                        insertId
                    );
                }
            }

            // 更新预算实际支出（仅支出账单且有影响行数时执行，与 account_id 无关）
            if (affectedRows === 1 && baseData.type === 2) {
                await this.updateBudgetActualAmountAfterBillCreate({
                    ...baseData,
                    billId: params.billId
                }, connection);
            }

            // 更新分类排序（仅当有 category_id 且有影响行数时执行，与 account_id 无关）
            if (affectedRows === 1 && baseData.category_id) {
                await this.updateCategorySortToTop(
                    baseData.user_id,
                    baseData.book_id,
                    baseData.category_id,
                    baseData.type,
                    connection
                );
            }

            await connection.commit();
            return affectedRows.toString();

        } catch (error) {
            await connection.rollback();
            const err = error as Error & { code: string };
            if (err.code === "ER_NO_REFERENCED_ROW_2") {
                console.error("❌ 外键错误：账本/分类/账户ID不存在（若传了account_id则需确保有效）");
            } else if (err.code === "ER_DUP_ENTRY") {
                console.error("❌ 唯一键冲突：账单ID已存在");
            } else {
                console.error("❌ 账单操作失败：", err.message);
            }
            throw new HttpError(`账单操作失败：${err.message}`, 500);

        } finally {
            connection.release();
        }
    }
    /**
     * 同步更新账户金额 + 记录账户流水（核心方法）
     * @param accountId 账户ID
     * @param amount 账单金额
     * @param type 变动类型：1=收入（加），2=支出（减），3=回滚收入，4=回滚支出
     * @param connection 事务连接
     * @param userId 用户ID
     * @param billId 关联账单ID
     * @param flowType 流水类型：1=收入，2=支出，3=回滚收入，4=回滚支出，5=删除收入，6=删除支出
     * @param remark 流水备注
     */
    private async syncAccountAmount(
        accountId: number,
        amount: number | string,
        type: number,
        connection: any,
        userId: number,
        billId: number,
        flowType: number,
        remark: string
    ): Promise<void> {
        const billAmount = Number(amount).toFixed(2);
        if (isNaN(Number(billAmount))) {
            throw new Error(`账户金额更新失败：账单金额格式错误（${amount}）`);
        }

        // 查询变动前余额
        const [balanceResult] = await connection.execute(
            `SELECT money FROM mate_account WHERE id = ? AND is_active = 1`,
            [accountId]
        );
        const account = (balanceResult as any[])[0];
        if (!account) {
            throw new Error(`账户ID ${accountId} 不存在或已禁用，金额更新失败`);
        }
        const balanceBefore = account.money;

        // 更新账户金额（允许负数）
        const updateSql = `
            UPDATE mate_account
            SET money = CASE
                            WHEN ? = 1 THEN ROUND(money + ?, 2)  -- 收入/回滚支出/删除支出：加金额
                            WHEN ? = 2 THEN ROUND(money - ?, 2)  -- 支出/回滚收入/删除收入：减金额
                            ELSE money
                END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND is_active = 1
        `;

        const [result] = await connection.execute(updateSql, [
            type, billAmount,
            type, billAmount,
            accountId
        ]);

        const updateResult = result as { affectedRows: number };
        if (updateResult.affectedRows === 0) {
            throw new Error(`账户ID ${accountId} 不存在或已禁用，金额更新失败`);
        }

        // 查询变动后余额
        const [afterBalanceResult] = await connection.execute(
            `SELECT money FROM mate_account WHERE id = ? AND is_active = 1`,
            [accountId]
        );
        const balanceAfter = (afterBalanceResult as any[])[0].money;

        // 插入流水
        await this.insertAccountFlow(
            connection,
            userId,
            accountId,
            billId,
            flowType,
            Math.abs(Number(billAmount)),
            balanceBefore,
            balanceAfter,
            remark
        );
    }

    /**
     * 插入账户流水记录（私有方法）
     * @param connection 事务连接
     * @param userId 用户ID
     * @param accountId 账户ID
     * @param billId 关联账单ID
     * @param flowType 流水类型：1=收入，2=支出，3=回滚收入，4=回滚支出，5=删除收入，6=删除支出
     * @param changeAmount 变动金额（正数）
     * @param balanceBefore 变动前余额
     * @param balanceAfter 变动后余额
     * @param remark 备注
     */
    private async insertAccountFlow(
        connection: any,
        userId: number,
        accountId: number,
        billId: number,
        flowType: number,
        changeAmount: number,
        balanceBefore: number | string,
        balanceAfter: number | string,
        remark: string
    ): Promise<void> {
        const insertFlowSql = `
            INSERT INTO mate_account_flow (
                user_id, account_id, bill_id, change_type, change_amount,
                balance_before, balance_after, remark, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;

        const [flowResult] = await connection.execute(insertFlowSql, [
            userId,
            accountId,
            billId,
            flowType,
            changeAmount.toFixed(2),
            Number(balanceBefore).toFixed(2),
            Number(balanceAfter).toFixed(2),
            remark
        ]);

        const flowInsertResult = flowResult as { affectedRows: number };
        if (flowInsertResult.affectedRows === 0) {
            throw new Error(`账户ID ${accountId} 流水记录插入失败`);
        }
    }

    /**
     * 删除账单（同步更新账户金额+记录流水）
     * @param userId 用户ID
     * @param billId 账单ID
     */
    async removeBill(
        userId: number,
        billId: number
    ): Promise<{
        code: number;
        message: string;
        data?: Record<string, any>;
    }> {
        const realUserId = Number(userId);
        const realBillId = Number(billId);
        let totalBookExpense = 0;

        if (isNaN(realUserId) || realUserId <= 0 || isNaN(realBillId) || realBillId <= 0) {
            console.error("删除账单失败：参数非法", { userId, billId });
            return { code: 400, message: "参数错误：用户ID和账单ID必须为正整数" };
        }

        let connection;
        try {
            connection = await pool.getConnection();
            await connection.beginTransaction();
            console.log(`开始删除账单事务 → 账单ID: ${realBillId}，用户ID: ${realUserId}`);

            // 步骤1：查询账单完整信息（含账户ID）
            const [billRows] = await connection.execute(
                `SELECT b.id                       AS bill_id,
                        b.user_id                  AS bill_user_id,
                        b.account_id               AS bill_account_id,
                        b.category_id              AS bill_category_id,
                        b.book_id                  AS bill_book_id,
                        b.amount                   AS bill_amount,
                        b.type                     AS bill_type,
                        b.bill_time,
                        mbc.id                     AS category_budget_id,
                        mbc.budget_id              AS related_budget_id,
                        mbc.category_amount        AS category_total_budget,
                        mbc.category_actual_amount AS category_current_actual,
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
                          LEFT JOIN mate_budget mb
                                    ON b.user_id = mb.user_id
                                        AND b.book_id = mb.book_id
                                        AND DATE (b.bill_time) BETWEEN mb.cycle_start AND mb.cycle_end
                 WHERE b.id = ? AND b.user_id = ?
                   AND b.is_deleted = 0
                   LIMIT 1`,
                [realBillId, realUserId]
            );

            const bill = (billRows as any[])[0];
            if (!bill) {
                await connection.rollback();
                return { code: 404, message: "账单不存在或不属于当前用户" };
            }

            const { bill_type: billType, bill_amount: billAmount, bill_account_id: billAccountId } = bill;

            // 步骤2：逻辑删除账单
            const [deleteRes] = await connection.execute(
                `UPDATE mate_bill
                 SET is_deleted = 1, updated_at = NOW()
                 WHERE id = ? AND user_id = ?`,
                [realBillId, realUserId]
            );
            const deleteAffectedRows = (deleteRes as any).affectedRows;
            if (deleteAffectedRows === 0) {
                await connection.rollback();
                return { code: 500, message: "账单删除失败（数据未变更）" };
            }
            console.log("账单逻辑删除成功，金额：", billAmount);

            // 步骤3：同步更新账户金额
            let accountUpdateResult = { accountUpdated: false, flowRecorded: false };
            if (billAccountId) {
                // 反向更新账户金额：
                // - 收入账单（type=1）删除 → 扣减金额（type=2）
                // - 支出账单（type=2）删除 → 加回金额（type=1）
                const reverseType = billType === 1 ? 2 : 1;
                // 流水类型：5=删除收入，6=删除支出
                const flowType = billType === 1 ? 5 : 6;
                const remark = `删除${billType === 1 ? "收入" : "支出"}账单，${billType === 1 ? "扣回" : "加回"}金额`;

                // 同步账户金额 + 记录删除流水
                await this.syncAccountAmount(
                    billAccountId,
                    billAmount,
                    reverseType,
                    connection,
                    realUserId,
                    realBillId,
                    flowType,
                    remark
                );

                accountUpdateResult = { accountUpdated: true, flowRecorded: true };
                console.log(`账户ID ${billAccountId} 金额更新成功：${billType === 1 ? "扣减" : "加回"} ${billAmount}元`);
            }

            // 步骤4：处理预算更新
            let budgetUpdateResult = { categoryUpdated: false, mainUpdated: false };
            const {
                bill_category_id: category_id,
                bill_book_id: book_id,
                category_budget_id,
                related_budget_id: mainBudgetId,
                category_current_actual,
                main_current_actual,
                main_total_budget,
                cycle_start,
                cycle_end,
            } = bill;

            if (category_budget_id && billType === 2) {
                const newCategoryActual = Math.max(
                    0,
                    Number(category_current_actual) - Number(billAmount)
                );
                const categoryTotalBudget = Number(bill.category_total_budget) || 0;
                let remainingPercent = 0;
                if (categoryTotalBudget > 0) {
                    remainingPercent = Number(
                        (((categoryTotalBudget - newCategoryActual) / categoryTotalBudget) * 100).toFixed(2)
                    );
                }

                await connection.execute(
                    `UPDATE mate_budget_category mbc
                     SET mbc.category_actual_amount = ?,
                         mbc.remaining_percent      = ?,
                         mbc.updated_at             = NOW()
                     WHERE mbc.id = ?`,
                    [newCategoryActual, remainingPercent, category_budget_id]
                );
                budgetUpdateResult.categoryUpdated = true;
            }

            if (mainBudgetId && billType === 2) {
                const [totalExpenseRows] = await connection.execute(
                    `SELECT IFNULL(CAST(SUM(b.amount) AS DECIMAL(16, 2)), 0.00) AS total_book_expense
                     FROM mate_bill b
                     WHERE b.user_id = ?
                       AND b.book_id = ?
                       AND b.type = 2
                       AND b.is_deleted = 0
                       AND b.amount > 0
                       AND DATE (b.bill_time) BETWEEN ? AND ?`,
                    [realUserId, book_id, cycle_start || "1970-01-01", cycle_end || "9999-12-31"]
                );

                totalBookExpense = Number((totalExpenseRows as any[])[0]?.total_book_expense || 0.0);
                const mainTotalBudget = Number(main_total_budget) || 0;
                let mainRemainingPercent = 0;
                if (mainTotalBudget > 0) {
                    mainRemainingPercent = Number(
                        (((mainTotalBudget - totalBookExpense) / mainTotalBudget) * 100).toFixed(2)
                    );
                }

                await connection.execute(
                    `UPDATE mate_budget mb
                     SET mb.actual_amount = ?,
                         mb.remaining_percent = ?,
                         mb.updated_at    = NOW()
                     WHERE mb.id = ?`,
                    [totalBookExpense, mainRemainingPercent, mainBudgetId]
                );
                budgetUpdateResult.mainUpdated = true;
            }

            // 步骤5：提交事务
            await connection.commit();

            // 步骤6：返回结果
            return {
                code: 200,
                message: (() => {
                    const accountMsg = accountUpdateResult.accountUpdated
                        ? `，账户已${billType === 1 ? "扣减" : "加回"}金额¥${billAmount}`
                        : "";
                    const budgetMsg = billType === 2
                        ? (budgetUpdateResult.categoryUpdated && budgetUpdateResult.mainUpdated
                            ? "，预算已重新计算"
                            : budgetUpdateResult.mainUpdated
                                ? "，总预算已重新计算"
                                : budgetUpdateResult.categoryUpdated
                                    ? "，分类预算已退回"
                                    : "")
                        : "";
                    return `账单删除成功${accountMsg}${budgetMsg}`;
                })(),
                data: {
                    affectedRows: deleteAffectedRows,
                    accountUpdate: accountUpdateResult,
                    budgetUpdate: budgetUpdateResult,
                    refundAmount: billAmount,
                    newCategoryActual: category_budget_id && billType === 2
                        ? Math.max(0, Number(category_current_actual) - Number(billAmount))
                        : 0,
                    newMainActual: totalBookExpense,
                },
            };
        } catch (error) {
            if (connection) await connection.rollback();
            console.error("删除账单事务异常", {
                billId: realBillId,
                userId: realUserId,
                error: (error as Error).message,
                stack: (error as Error).stack,
            });
            return {
                code: 500,
                message: `删除账单失败：${(error as Error).message || "服务器内部错误"}`,
            };
        } finally {
            if (connection) connection.release();
        }
    }
    /**
     * 公共方法：插入账户流水（供外部模块调用）
     * @param userId 用户ID
     * @param accountId 账户ID
     * @param billId 关联账单ID（账户操作传0即可）
     * @param flowType 流水类型：7=账户创建，8=账户金额修改
     * @param changeAmount 变动金额（正数）
     * @param balanceBefore 变动前余额
     * @param balanceAfter 变动后余额
     * @param remark 流水备注
     */
    async addAccountFlow(
        userId: number,
        accountId: number,
        billId: number,
        flowType: number,
        changeAmount: number,
        balanceBefore: number | string,
        balanceAfter: number | string,
        remark: string
    ): Promise<void> {
        const connection = await pool.getConnection();
        try {
            await this.insertAccountFlow(
                connection,
                userId,
                accountId,
                billId,
                flowType,
                changeAmount,
                balanceBefore,
                balanceAfter,
                remark
            );
        } finally {
            connection.release();
        }
    }
    /**
     * 核心方法：动态置顶指定分类
     * @param userId 用户ID
     * @param bookId 账本ID
     * @param categoryId 分类ID
     * @param type 账单类型（1=收入，2=支出）
     * @param connection 事务连接
     */
    private async updateCategorySortToTop(
        userId: number,
        bookId: number,
        categoryId: number,
        type: number,
        connection: any
    ) {
        try {
            const validUserId = userId > 0 ? userId : null;
            const [allCategoryIds] = await connection.execute(
                `SELECT id FROM ${this.categoryTableName}
             WHERE type = ? AND is_deleted = 0 AND is_active = 1
               AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))`,
                [type, validUserId, validUserId]
            );
            const validCategoryIds = (allCategoryIds as any[]).map(item => item.id);
            if (!validCategoryIds.includes(categoryId)) {
                console.warn(`分类${categoryId}无效/已删除/非当前用户所属，跳过排序更新`);
                return;
            }

            const [sortList] = await connection.execute(
                `SELECT category_id, sort_order
                 FROM ${this.categoryUserSortTableName}
                 WHERE user_id = ? AND book_id = ?
                   AND category_id IN (${validCategoryIds.map(() => "?").join(",")})
                 ORDER BY sort_order ASC`,
                [validUserId, bookId, ...validCategoryIds]
            );
            const sortRecords = sortList as Array<{ category_id: number; sort_order: number }>;
            const targetRecord = sortRecords.find(item => item.category_id === categoryId);

            if (!targetRecord) {
                if (sortRecords.length > 0) {
                    await connection.execute(
                        `UPDATE ${this.categoryUserSortTableName}
                         SET sort_order = sort_order + 1, version = version + 1, updated_at = NOW()
                         WHERE user_id = ? AND book_id = ?
                           AND category_id IN (${sortRecords.map(() => "?").join(",")})`,
                        [validUserId, bookId, ...sortRecords.map(item => item.category_id)]
                    );
                }
                await connection.execute(
                    `INSERT INTO ${this.categoryUserSortTableName}
                     (user_id, book_id, category_id, sort_order, version, created_at, updated_at)
                     VALUES (?, ?, ?, 1, 1, NOW(), NOW())
                         ON DUPLICATE KEY UPDATE
                                              sort_order = 1,
                                              updated_at = NOW(),
                                              version = version + 1`,
                    [validUserId, bookId, categoryId]
                );
            } else {
                if (targetRecord.sort_order === 1) {
                    console.log(`分类${categoryId}已在【用户${validUserId}/账本${bookId}】维度下排第一，无需更新`);
                    return;
                }
                const remainingRecords = sortRecords.filter(item => item.category_id !== categoryId);
                if (remainingRecords.length > 0) {
                    let caseSql = "CASE category_id ";
                    let params: any[] = [];
                    remainingRecords.forEach((item, i) => {
                        caseSql += `WHEN ? THEN ? `;
                        params.push(item.category_id, i + 2);
                    });
                    caseSql += "END";
                    await connection.execute(
                        `UPDATE ${this.categoryUserSortTableName}
                     SET sort_order = ${caseSql}, version = version + 1, updated_at = NOW()
                     WHERE user_id = ? AND book_id = ?
                       AND category_id IN (${remainingRecords.map(() => "?").join(",")})`,
                        [...params, validUserId, bookId, ...remainingRecords.map(item => item.category_id)]
                    );
                }
                await connection.execute(
                    `UPDATE ${this.categoryUserSortTableName}
                     SET sort_order = 1, version = version + 1, updated_at = NOW()
                     WHERE user_id = ? AND book_id = ? AND category_id = ?`,
                    [validUserId, bookId, categoryId]
                );
            }
            console.log(`分类${categoryId}已在【用户${validUserId}/账本${bookId}】维度下动态置顶为新第一`);
        } catch (error) {
            console.error("❌ 更新分类排序失败：", (error as Error).message);
            throw error;
        }
    }

    /**
     * 新增支出账单后，更新对应预算/分类预算的实际支出
     * @param billData 账单数据
     * @param connection 事务连接
     */
    private async updateBudgetActualAmountAfterBillCreate(billData: any, connection: any) {
        try {
            const exec = connection ? connection.execute : pool.execute;
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

            // 重新计算该预算周期的总实际支出
            const totalActualAmount = await this.calculateBudgetActualExpense(
                billData.user_id,
                billData.book_id,
                budget.cycle_start,
                budget.cycle_end
            );

            // 更新主预算表的实际支出
            await pool.execute(
                `UPDATE ${this.budgetTableName}
                 SET actual_amount     = ?,
                     remaining_percent = IF(
                             amount = 0,
                             0,
                             ROUND(((amount - ?) / amount) * 100, 2)
                                         ),
                     updated_at        = NOW()
                 WHERE id = ?`,
                [totalActualAmount, totalActualAmount, budget.id]
            );
            console.log(`✅ 主预算ID ${budget.id} 实际支出更新为：${totalActualAmount}元`);

            // 重新计算该分类在该预算周期的实际支出
            const categoryActualAmount = await this.calculateCategoryActualExpense(
                billData.user_id,
                billData.book_id,
                budget.cycle_start,
                budget.cycle_end,
                billData.category_id
            );

            // 更新分类预算表的实际支出
            const [rows] = await exec(
                `SELECT *
                 FROM ${this.budgetCategoryTableName}
                 WHERE budget_id = ?
                   AND category_id = ? LIMIT 1`,
                [budget.id, billData.category_id]
            );

            let categoryRemainingPercent = 0;
            let budgetCategory = (rows as any[])[0];
            if (budgetCategory?.category_amount > 0) {
                categoryRemainingPercent = Number(
                    (((budgetCategory.category_amount - categoryActualAmount) / budgetCategory.category_amount) * 100).toFixed(2)
                );
            }

            await exec(
                `UPDATE ${this.budgetCategoryTableName}
                 SET category_actual_amount = ?,
                     remaining_percent      = ?,
                     updated_at             = NOW()
                 WHERE budget_id = ?
                   AND category_id = ?`,
                [
                    categoryActualAmount,
                    categoryRemainingPercent,
                    budget.id,
                    billData.category_id,
                ]
            );

            console.log(`✅ 预算ID ${budget.id} 分类ID ${billData.category_id} 实际支出更新为：${categoryActualAmount}元`);
        } catch (error: any) {
            console.error(`⚠️ 更新预算实际支出失败：${error.message}`, error);
        }
    }

    /**
     * 根据账单时间匹配所属预算
     * @param user_id 用户ID
     * @param book_id 账本ID
     * @param billTime 账单时间
     */
    private async getBudgetByBillTime(
        user_id: number,
        book_id: number,
        billTime: dayjs.Dayjs
    ): Promise<{
        id: number;
        cycle_start: string;
        cycle_end: string;
        cycle_type: string;
    } | null> {
        const billDate = billTime.format("YYYY-MM-DD");
        const querySql = `
            SELECT id, cycle_start, cycle_end, cycle_type
            FROM ${this.budgetTableName}
            WHERE user_id = ?
              AND book_id = ?
              AND cycle_start <= ?
              AND cycle_end >= ?
            ORDER BY FIELD(cycle_type, 'custom', 'day', 'week', 'month', 'year') LIMIT 1
        `;
        const queryParams = [user_id, book_id, billDate, billDate];
        const [rows] = await pool.execute(querySql, queryParams);
        const budgetList = rows as Array<{
            id: number;
            cycle_start: string;
            cycle_end: string;
            cycle_type: string;
        }>;
        return budgetList.length > 0 ? budgetList[0] : null;
    }

    /**
     * 计算预算周期总实际支出
     * @param user_id 用户ID
     * @param book_id 账本ID
     * @param cycle_start 周期开始时间
     * @param cycle_end 周期结束时间
     */
    private async calculateBudgetActualExpense(
        user_id: number,
        book_id: number,
        cycle_start: string,
        cycle_end: string
    ): Promise<number> {
        const [rows] = await pool.execute(
            `SELECT IFNULL(SUM(amount), 0) AS total_expense
             FROM ${this.billTableName}
             WHERE user_id = ?
               AND book_id = ?
               AND type = 2
               AND is_deleted = 0
               AND bill_time BETWEEN ? AND ?`,
            [user_id, book_id, cycle_start, cycle_end]
        );
        const resultRows = rows as Array<{ total_expense: number | string }>;
        const rawTotal = resultRows[0]?.total_expense ?? 0;
        return Math.round(Number(rawTotal) * 100) / 100;
    }

    /**
     * 计算分类实际支出
     * @param user_id 用户ID
     * @param book_id 账本ID
     * @param cycle_start 周期开始时间
     * @param cycle_end 周期结束时间
     * @param category_id 分类ID
     */
    private async calculateCategoryActualExpense(
        user_id: number,
        book_id: number,
        cycle_start: string,
        cycle_end: string,
        category_id: number
    ): Promise<number> {
        const [rows] = await pool.execute(
            `SELECT IFNULL(SUM(amount), 0) AS total_expense
             FROM ${this.billTableName}
             WHERE user_id = ?
               AND book_id = ?
               AND type = 2
               AND category_id = ?
               AND is_deleted = 0
               AND bill_time BETWEEN ? AND ?`,
            [user_id, book_id, category_id, cycle_start, cycle_end]
        );
        const resultRows = rows as Array<{ total_expense: number | string }>;
        const rawTotal = resultRows[0]?.total_expense ?? 0;
        return Math.round(Number(rawTotal) * 100) / 100;
    }

    /**
     * 查询账单列表
     * @param userId 用户ID
     * @param page 页码
     * @param pageSize 页大小
     * @param start_time 开始时间
     * @param end_time 结束时间
     * @param bookId 账本ID
     * @param type 账单类型
     * @param categoryId 分类ID
     */
    async billList(
        userId: number,
        page?: number,
        pageSize?: number,
        start_time?: string,
        end_time?: string,
        bookId?: number,
        type?: number | null | undefined,
        categoryId?: number
    ): Promise<any> {
        const formatAmount = (amount: number): string => {
            return amount.toFixed(2);
        };

        try {
            // 分页参数标准化
            const validPage = Math.max(Number(page) || 1, 1);
            const validPageSize = Math.max(Number(pageSize) || 1000, 1);
            const offset = (validPage - 1) * validPageSize;
            const offsetStr = String(offset);
            const pageSizeStr = String(validPageSize);

            // 时间参数处理
            const now = new Date();
            let defaultStart = new Date(1970, 0, 1, 0, 0, 0);
            let defaultEnd = new Date(now.getTime());
            let isDateLevelQuery = false;

            // 查询用户账单的实际时间边界
            const getBillTimeBoundary = async (userId: number, bookId?: number) => {
                let boundaryConditions: string[] = ["b.user_id = ?", "b.is_deleted = 0"];
                let boundaryParams: (number | null)[] = [userId];

                if (bookId !== null && bookId !== undefined && Number(bookId) > 0) {
                    boundaryConditions.push("b.book_id = ?");
                    boundaryParams.push(Number(bookId));
                }

                const [boundaryRows] = await pool.execute(
                    `SELECT IFNULL(MIN(b.bill_time), '1970-01-01 00:00:00') AS min_time,
                            IFNULL(MAX(b.bill_time), NOW())                 AS max_time
                     FROM ${this.billTableName} b
                     WHERE ${boundaryConditions.join(" AND ")}`,
                    boundaryParams
                );

                const minTimeStr = (boundaryRows as any[])[0]?.min_time || "1970-01-01 00:00:00";
                const maxTimeStr = (boundaryRows as any[])[0]?.max_time || new Date().toISOString().slice(0, 19).replace("T", " ");

                return {
                    minTime: new Date(minTimeStr),
                    maxTime: new Date(maxTimeStr),
                };
            };

            if (!start_time && !end_time) {
                const { minTime, maxTime } = await getBillTimeBoundary(userId, bookId);
                defaultStart = minTime;
                defaultEnd = maxTime;
            }

            // 时间格式化工具函数
            const formatTimeByRule = (date: Date, isDateLevel: boolean): string => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, "0");
                if (isDateLevel) {
                    const day = String(date.getDate()).padStart(2, "0");
                    return `${year}-${month}-${day}`;
                }
                return `${year}-${month}`;
            };

            const formatToFullTime = (date: Date): string => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, "0");
                const day = String(date.getDate()).padStart(2, "0");
                const hours = String(date.getHours()).padStart(2, "0");
                const minutes = String(date.getMinutes()).padStart(2, "0");
                const seconds = String(date.getSeconds()).padStart(2, "0");
                return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            };

            const getPeriodTime = (
                timeStr: string
            ): {
                start: Date;
                end: Date;
                dimension: "year" | "month" | "custom";
                year: number;
                month?: number;
                isDateLevel: boolean;
                originalStr: string;
            } => {
                if (!timeStr) {
                    throw new Error("时间字符串不能为空");
                }
                if (/^\d{4}$/.test(timeStr)) {
                    const year = Number(timeStr);
                    return {
                        start: new Date(year, 0, 1, 0, 0, 0),
                        end: new Date(year, 11, 31, 23, 59, 59),
                        dimension: "year",
                        year,
                        isDateLevel: false,
                        originalStr: timeStr,
                    };
                } else if (/^\d{4}-\d{2}$/.test(timeStr)) {
                    const [year, month] = timeStr.split("-").map(Number);
                    return {
                        start: new Date(year, month - 1, 1, 0, 0, 0),
                        end: new Date(year, month, 0, 23, 59, 59),
                        dimension: "month",
                        year,
                        month,
                        isDateLevel: false,
                        originalStr: timeStr,
                    };
                } else if (/^\d{4}-\d{2}-\d{2}$/.test(timeStr)) {
                    const [year, month, day] = timeStr.split("-").map(Number);
                    return {
                        start: new Date(year, month - 1, day, 0, 0, 0),
                        end: new Date(year, month - 1, day, 23, 59, 59),
                        dimension: "custom",
                        year,
                        month,
                        isDateLevel: true,
                        originalStr: timeStr,
                    };
                } else {
                    throw new Error(`时间格式错误：${timeStr}，仅支持 YYYY、YYYY-MM、YYYY-MM-DD`);
                }
            };

            // 确定最终起止时间
            let finalStartTime: string = formatToFullTime(defaultStart);
            let finalEndTime: string = formatToFullTime(defaultEnd);
            let queryDimension: "year" | "month" | "custom" = "custom";
            let targetYear = now.getFullYear();
            let targetMonth = now.getMonth() + 1;
            let displayStartTime: string = formatTimeByRule(defaultStart, true);
            let displayEndTime: string = formatTimeByRule(defaultEnd, true);
            let originalStartStr = "";
            let originalEndStr = "";

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
                        throw new Error("开始时间不能晚于结束时间");
                    }
                    finalStartTime = formatToFullTime(startPeriod.start);
                    finalEndTime = formatToFullTime(endPeriod.end);
                    isDateLevelQuery = isDateLevelQuery || endPeriod.isDateLevel;
                    queryDimension = "custom";
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

            // 全量收支统计
            let fullWhereConditions: string[] = ["b.user_id = ?", "b.is_deleted = 0"];
            let fullQueryParams: (string | number | null)[] = [userId];
            fullWhereConditions.push("b.bill_time BETWEEN ? AND ?");
            fullQueryParams.push(finalStartTime, finalEndTime);
            if (bookId !== null && bookId !== undefined && Number(bookId) > 0) {
                fullWhereConditions.push("b.book_id = ?");
                fullQueryParams.push(Number(bookId));
            }
            if (categoryId !== null && categoryId !== undefined && Number(categoryId) > 0) {
                fullWhereConditions.push("b.category_id = ?");
                fullQueryParams.push(Number(categoryId));
            }

            const [fullSummaryRows] = await pool.execute(
                `SELECT IFNULL(SUM(CASE WHEN b.type = 1 THEN b.amount ELSE 0 END), 0.00) AS fullIncomeTotal,
                        IFNULL(SUM(CASE WHEN b.type = 2 THEN b.amount ELSE 0 END), 0.00) AS fullExpendTotal,
                        IFNULL(COUNT(CASE WHEN b.type = 1 THEN 1 END), 0) AS fullIncomeCount,
                        IFNULL(COUNT(CASE WHEN b.type = 2 THEN 1 END), 0) AS fullExpendCount,
                        IFNULL(COUNT(*), 0) AS fullTotalCount
                 FROM ${this.billTableName} b
                 WHERE ${fullWhereConditions.join(" AND ")}`,
                fullQueryParams
            );

            const totalIncome = Number((fullSummaryRows as any[])[0]?.fullIncomeTotal || 0);
            const totalExpend = Number((fullSummaryRows as any[])[0]?.fullExpendTotal || 0);
            const totalSurplus = Number((totalIncome - totalExpend).toFixed(2));
            const totalIncomeCount = Number((fullSummaryRows as any[])[0]?.fullIncomeCount || 0);
            const totalExpendCount = Number((fullSummaryRows as any[])[0]?.fullExpendCount || 0);
            const totalBillCount = Number((fullSummaryRows as any[])[0]?.fullTotalCount || 0);

            // 列表查询
            let whereConditions: string[] = ["b.user_id = ?", "b.is_deleted = 0"];
            let queryParams: (string | number | null)[] = [userId];

            if (type == 1) {
                whereConditions.push("b.type = 1");
            } else if (type == 2) {
                whereConditions.push("b.type = 2");
            }
            whereConditions.push("b.bill_time BETWEEN ? AND ?");
            queryParams.push(finalStartTime, finalEndTime);
            if (bookId !== null && bookId !== undefined && Number(bookId) > 0) {
                whereConditions.push("b.book_id = ?");
                queryParams.push(Number(bookId));
            }
            if (categoryId !== null && categoryId !== undefined && Number(categoryId) > 0) {
                whereConditions.push("b.category_id = ?");
                queryParams.push(Number(categoryId));
            }

            const listQueryParams = [...queryParams, offsetStr, pageSizeStr];
            const [listRows] = await pool.execute(
                `SELECT b.id,
                        b.user_id,
                        b.amount,
                        b.type,
                        b.currency,
                        b.image_list,
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
                 WHERE ${whereConditions.join(" AND ")}
                 ORDER BY b.bill_time DESC, b.id DESC  -- 主要按时间降序，时间相同则按id降序
                 LIMIT ?, ?`,
                listQueryParams
            );

            // 格式化账单 & 计算列表级收支
            let currentPageIncome = 0;
            let currentPageExpend = 0;
            let listTotalIncome = 0;
            let listTotalExpend = 0;
            let currentPageIncomeCount = 0;
            let currentPageExpendCount = 0;
            let listTotalIncomeCount = 0;
            let listTotalExpendCount = 0;

            const rawBillList = (listRows as any[]).map((item) => {
                const amount = Number(item.amount || 0);
                if (item.type === 1) {
                    currentPageIncome += amount;
                    listTotalIncome += amount;
                    currentPageIncomeCount++;
                    listTotalIncomeCount++;
                } else if (item.type === 2) {
                    currentPageExpend += amount;
                    listTotalExpend += amount;
                    currentPageExpendCount++;
                    listTotalExpendCount++;
                }

                return {
                    id: item.id || 0,
                    user_id: item.user_id || 0,
                    amount: amount,
                    type: item.type || 0,
                    currency: item.currency || "",
                    full_bill_time: item.full_bill_time || "",
                    bill_time: item.bill_time || "",
                    remark: item.remark || "",
                    isCollapse:false,
                    tags: (() => {
                        try {
                            return JSON.parse(item.tags || "[]");
                        } catch {
                            return [];
                        }
                    })(),
                    image_list: (() => {
                        try {
                            return JSON.parse(item.image_list || "[]");
                        } catch {
                            return [];
                        }
                    })(),
                    created_at: item.created_at || "",
                    updated_at: item.updated_at || "",
                    singleProgress: 0,
                    category: {
                        name: item.category_name || "未分类",
                        icon: item.category_icon || "",
                        type: item.category_type || 0,
                        id: item.category_id || 0,
                    },
                    book: {
                        id: item.book_id || 0,
                        name: item.book_name || "默认账本",
                        is_default: item.book_is_default || 0,
                    },
                    _year: item.bill_year || "",
                    _month: item.bill_month || "",
                    _day: item.bill_day || "",
                };
            });

            const currentPageSurplus = Number((currentPageIncome - currentPageExpend).toFixed(2));
            const listTotalSurplus = Number((listTotalIncome - listTotalExpend).toFixed(2));
            const currentPageTotalCount = currentPageIncomeCount + currentPageExpendCount;
            const listTotalCount = listTotalIncomeCount + listTotalExpendCount;

            // 日期分组
            const dayGroupMap = new Map<string, any>();
            rawBillList.forEach((bill) => {
                if (!bill._year || !bill._month || !bill._day) return;

                const dayKey = `${bill._year}-${bill._month}-${bill._day}`;
                if (!dayGroupMap.has(dayKey)) {
                    dayGroupMap.set(dayKey, {
                        year: bill._year,
                        month: bill._month,
                        day: bill._day,
                        weekday: "",
                        name: `${bill._month}月${bill._day}日`,
                        incomeMoney: 0,
                        expendMoney: 0,
                        surplusMoney: 0,
                        incomeProgress: 0,
                        expendProgress: 0,
                        surplusProgress: 0,
                        surplusDirection: "",
                        list: [],
                    });
                }
                const dayGroup = dayGroupMap.get(dayKey)!;

                if (bill.type === 1) {
                    dayGroup.incomeMoney += bill.amount;
                } else if (bill.type === 2) {
                    dayGroup.expendMoney += bill.amount;
                }

                const { _year, _month, _day, ...pureBill } = bill;
                dayGroup.list.push({
                    ...pureBill,
                    amount: pureBill.amount.toFixed(2),
                    singleProgress: 0,
                });
            });

            // 补全星期几
            const getWeekday = (year: string, month: string, day: string) => {
                if (!year || !month || !day) return "";
                const date = new Date(Number(year), Number(month) - 1, Number(day));
                if (isNaN(date.getTime())) return "";
                const weekdayMap = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
                return weekdayMap[date.getDay()];
            };
            Array.from(dayGroupMap.values()).forEach((dayGroup) => {
                dayGroup.weekday = getWeekday(dayGroup.year, dayGroup.month, dayGroup.day);
            });

            // 计算全局动态基准值
            const dayGroupList = Array.from(dayGroupMap.values());
            const allIncome = dayGroupList.map((day) => day.incomeMoney);
            const allExpend = dayGroupList.map((day) => day.expendMoney);
            const globalMaxIncome = Math.max(...allIncome, 0);
            const globalMaxExpend = Math.max(...allExpend, 0);
            const dynamicBaseMax = Math.max(globalMaxIncome, globalMaxExpend);

            // 进度计算工具函数
            const calculateProgress = (current: number, baseMax: number): number => {
                if (baseMax === 0) return 0;
                const progress = (current / baseMax) * 100;
                return Number(Math.min(Math.max(progress, 0), 100).toFixed(1));
            };

            // 计算每日进度
            dayGroupList.forEach((dayGroup) => {
                dayGroup.incomeProgress = calculateProgress(dayGroup.incomeMoney, dynamicBaseMax);
                dayGroup.expendProgress = calculateProgress(dayGroup.expendMoney, dynamicBaseMax);
                dayGroup.surplusMoney = Number((dayGroup.incomeMoney - dayGroup.expendMoney).toFixed(2));
                dayGroup.surplusDirection = dayGroup.surplusMoney >= 0 ? "盈余" : "赤字";
                dayGroup.surplusProgress = calculateProgress(Math.abs(dayGroup.surplusMoney), dynamicBaseMax);

                dayGroup.list.forEach((bill: any) => {
                    bill.singleProgress = calculateProgress(Number(bill.amount), dynamicBaseMax);
                });
            });

            // 月份分组
            const monthGroupMap = new Map<string, any>();
            dayGroupList.forEach((dayGroup) => {
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
                        children: [],
                    });
                }
                const monthGroup = monthGroupMap.get(monthKey)!;

                monthGroup.incomeMoney += dayGroup.incomeMoney;
                monthGroup.expendMoney += dayGroup.expendMoney;

                monthGroup.incomeProgress = calculateProgress(monthGroup.incomeMoney, dynamicBaseMax);
                monthGroup.expendProgress = calculateProgress(monthGroup.expendMoney, dynamicBaseMax);
                monthGroup.surplusMoney = Number((monthGroup.incomeMoney - monthGroup.expendMoney).toFixed(2));
                monthGroup.surplusDirection = monthGroup.surplusMoney >= 0 ? "盈余" : "赤字";
                monthGroup.surplusProgress = calculateProgress(Math.abs(monthGroup.surplusMoney), dynamicBaseMax);

                monthGroup.children.push(dayGroup);
            });

            // 格式化月份列表
            const monthList = Array.from(monthGroupMap.values())
                .map((monthGroup) => ({
                    ...monthGroup,
                    incomeMoney: monthGroup.incomeMoney.toFixed(2),
                    expendMoney: monthGroup.expendMoney.toFixed(2),
                    surplusMoney: monthGroup.surplusMoney.toFixed(2),
                    incomeProgress: monthGroup.incomeProgress,
                    expendProgress: monthGroup.expendProgress,
                    surplusProgress: monthGroup.surplusProgress,
                    children: monthGroup.children
                        .map((dayGroup: any) => ({
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
                                status: true,
                            })),
                        }))
                        .sort((a: any, b: any) => Number(b.day) - Number(a.day)),
                }))
                .sort((a, b) => {
                    if (a.year !== b.year) return Number(b.year) - Number(a.year);
                    return Number(b.month) - Number(a.month);
                });

            if (monthList.length === 0) {
                const startDate = new Date(finalStartTime);
            }

            const formattedList = {
                ...(queryDimension === "custom"
                    ? {
                        timeRange: {
                            start: displayStartTime,
                            end: displayEndTime,
                        },
                    }
                    : {
                        year: targetYear,
                        ...(queryDimension === "month" ? { month: targetMonth } : {}),
                    }),
                listType: "month",
                dataList: monthList,
            };

            // 总条数查询
            let total = 0;
            const [countRows] = await pool.execute(
                `SELECT COUNT(*) AS total
                 FROM ${this.billTableName} b
                 WHERE ${whereConditions.join(" AND ")}`,
                queryParams
            );
            total = Number((countRows as any[])[0]?.total || 0);
            const totalPage = Math.ceil(total / validPageSize);

            // 全局进度计算
            const incomeProgress = calculateProgress(listTotalIncome, dynamicBaseMax);
            const expendProgress = calculateProgress(listTotalExpend, dynamicBaseMax);
            const surplusProgress = calculateProgress(Math.abs(listTotalSurplus), dynamicBaseMax);
            const currentPageSurplusProgress = calculateProgress(Math.abs(currentPageSurplus), dynamicBaseMax);

            // 返回结果
            return {
                code: 200,
                list: formattedList,
                summary: {
                    // 金额维度
                    totalIncome: formatAmount(totalIncome),
                    totalExpend: formatAmount(totalExpend),
                    totalSurplus: formatAmount(totalSurplus),
                    listIncome: formatAmount(listTotalIncome),
                    listExpend: formatAmount(listTotalExpend),
                    listSurplus: formatAmount(listTotalSurplus),
                    currentPageIncome: currentPageIncome.toFixed(2),
                    currentPageExpend: currentPageExpend.toFixed(2),
                    currentPageSurplus: currentPageSurplus.toString(),
                    // 数量维度
                    totalIncomeCount: totalIncomeCount,
                    totalExpendCount: totalExpendCount,
                    totalBillCount: totalBillCount,
                    listIncomeCount: listTotalIncomeCount,
                    listExpendCount: listTotalExpendCount,
                    listTotalCount: listTotalCount,
                    currentPageIncomeCount: currentPageIncomeCount,
                    currentPageExpendCount: currentPageExpendCount,
                    currentPageTotalCount: currentPageTotalCount,
                    // 其他字段
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
                    progressDesc: `进度基准：${dynamicBaseMax === globalMaxIncome ? "收入" : "支出"}最大值(${dynamicBaseMax.toFixed(2)})=100%`,
                    filterType: type === undefined || type === null ? "all" : type,
                    filterCategoryId: categoryId || "all",
                    emptyTip: total === 0 ? "当前筛选条件下无账单数据" : "",
                },
                pagination: {
                    total,
                    page: validPage,
                    pageSize: validPageSize,
                    totalPage,
                },
            };
        } catch (error: any) {
            console.error("查询账单列表失败：", error.message, error.stack);

            const now = new Date();
            const defaultYear = now.getFullYear();
            const defaultMonth = now.getMonth() + 1;
            const formatTimeByRule = (date: Date, isDateLevel: boolean): string => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, "0");
                if (isDateLevel) {
                    const day = String(date.getDate()).padStart(2, "0");
                    return `${year}-${month}-${day}`;
                }
                return `${year}-${month}`;
            };
            const displayStartTime = formatTimeByRule(new Date(1970, 0, 1), false);
            const displayEndTime = formatTimeByRule(now, false);

            return {
                code: 500,
                message: error.message || "查询账单失败",
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
                    // 其他字段兜底
                    year: defaultYear,
                    month: defaultMonth,
                    start_year: defaultYear,
                    start_month: defaultMonth,
                    end_year: defaultYear,
                    end_month: defaultMonth,
                    queryDimension: "custom",
                    surplusDirection: "盈余",
                    currentPageSurplusProgress: 0,
                    incomeProgress: 0,
                    expendProgress: 0,
                    surplusProgress: 0,
                    start_time: displayStartTime,
                    end_time: displayEndTime,
                    progressDesc: "",
                    filterType: type === undefined || type === null ? "all" : type,
                    filterCategoryId: categoryId || "all",
                    emptyTip: "查询异常，暂无数据",
                },
                pagination: {
                    total: 0,
                    page: Math.max(Number(page) || 1, 1),
                    pageSize: Math.max(Number(pageSize) || 10, 1),
                    totalPage: 0,
                },
            };
        }
    }

    /**
     * 查询单条账单详情
     * @param userId 用户ID
     * @param billId 账单ID
     */
    async billInfo(userId: number, billId: number): Promise<any> {
        try {
            const getWeekday = (year: string, month: string, day: string) => {
                const date = new Date(Number(year), Number(month) - 1, Number(day));
                const weekdayMap = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
                return weekdayMap[date.getDay()];
            };

            // 参数校验
            const validUserId = Number(userId);
            const validBillId = Number(billId);
            if (isNaN(validUserId) || validUserId <= 0) {
                return {
                    code: 400,
                    msg: "用户ID无效",
                    data: null,
                };
            }
            if (isNaN(validBillId) || validBillId <= 0) {
                return {
                    code: 400,
                    msg: "账单ID无效",
                    data: null,
                };
            }

            // 查询账单详情
            const [billRows] = await pool.execute(
                `SELECT b.id,
                        b.user_id,
                        b.amount,
                        b.type,
                        b.currency,
                        b.address,
                        b.latitude,
                        b.longitude,
                        DATE_FORMAT(b.bill_time, '%Y-%m-%d %H:%i')     AS bill_time,
                        DATE_FORMAT(b.bill_time, '%Y')                 AS bill_year,
                        DATE_FORMAT(b.bill_time, '%m')                 AS bill_month,
                        DATE_FORMAT(b.bill_time, '%d')                 AS bill_day,
                        b.tags,
                        b.image_list,
                        b.remark,
                        DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                        DATE_FORMAT(b.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
                        c.id                                           AS category_id,
                        c.name                                         AS category_name,
                        c.icon                                         AS category_icon,
                        c.type                                         AS category_type,
                        bo.id                                          AS book_id,
                        bo.name                                        AS book_name,
                        bo.is_default                                  AS book_is_default,
                        ac.id                                          AS account_id,  -- 修复：添加逗号分隔字段
                        ac.name                                        AS account_name,
                        ac.icon                                        AS account_icon,
                        ac.is_active                                  AS account_is_active  -- 修复：避免别名重复（原is_active改为account_is_active）
                 FROM ${this.billTableName} b
                          LEFT JOIN mate_category c
                                    ON b.category_id = c.id
                          LEFT JOIN mate_book bo
                                    ON b.book_id = bo.id
                          LEFT JOIN mate_account ac  -- 修复：调整关联顺序，避免冗余关联
                                    ON b.account_id = ac.id
                 WHERE b.id = ?
                   AND b.user_id = ?
                   AND b.is_deleted = 0`,
                [validBillId, validUserId]
            );
            // 校验账单是否存在
            const billItem = (billRows as any[])[0];
            if (!billItem) {
                return {
                    code: 404,
                    msg: "账单不存在或无访问权限",
                    data: null,
                };
            }

            // 格式化账单数据
            const formattedBill = {
                id: billItem.id,
                user_id: billItem.user_id,
                amount: formatAmount(billItem.amount),
                amountNumber: Number(formatAmount(billItem.amount)),
                type: billItem.type,
                typeText: billItem.type === 1 ? "收入" : "支出",
                currency: billItem.currency || "CNY",
                bill_time: billItem.bill_time,
                address:billItem.address,
                latitude: billItem.latitude,
                longitude: billItem.longitude,
                dateInfo: {
                    year: billItem.bill_year,
                    month: billItem.bill_month,
                    day: billItem.bill_day,
                    weekday: getWeekday(billItem.bill_year, billItem.bill_month, billItem.bill_day),
                },
                tags: parseJsonToArray(billItem.tags),
                image_list:billItem.image_list,
                remark: billItem.remark || "",
                created_at: billItem.created_at,
                updated_at: billItem.updated_at,
                category: {
                    id: billItem.category_id || 0,
                    name: billItem.category_name || "--",
                    icon: billItem.category_icon || "",
                    type: billItem.category_type || billItem.type,
                },
                account: {
                    id: billItem.account_id || 0,
                    name: billItem.account_name || "--",
                    icon: billItem.account_icon || "",
                    is_active: billItem.account_is_active || 0,
                },
                book: {
                    id: billItem.book_id || 0,
                    name: billItem.book_name || "--",
                    is_default: billItem.book_is_default || 0,
                },
            };

            // 返回成功结果
            return {
                code: 200,
                msg: "查询成功",
                data: formattedBill,
            };
        } catch (error: any) {
            console.error("查询账单详情失败：", error.message, error.stack);
            return {
                code: 500,
                msg: "服务器内部错误",
                data: null,
                error: process.env.NODE_ENV === "development" ? error.message : "",
            };
        }
    }
}

export default new BillModule();