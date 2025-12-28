import pool from '../../db';
import type {BudgetCategoryDbSchema} from "../../types";
import HttpError from "../../utils/HttpError";

class BudgetCategoryModule {
    budgetCategoryTableName = 'mate_budget_category';
    budgetTableName = 'mate_budget';
    billTableName = 'mate_bill';

    /**
     * 创建预算
     * @param params
     */
    async create(params: BudgetCategoryDbSchema): Promise<undefined | number> {
        /**
         * 1- 暂无账单：新建账单正常新增
         * 2- 有账单：通过预算周期开始日期 - 预算结束日期 取筛选 支出总金额
         */
            // 1. 构造完全匹配表结构的默认数据
        const defaultData = {
                user_id: params.user_id,
                book_id: params.book_id,
                budget_id: params.budget_id,
                category_id: params.category_id,
                category_amount: params.category_amount,
                // category_actual_amount: params.category_actual_amount,
                sort_order: params.sort_order || 99,
                is_active: params.is_active || 1,
                created_at: new Date().toISOString().slice(0, 19).replace("T", " "), // 可选：数据库自动生成，也可手动传
                updated_at: new Date().toISOString().slice(0, 19).replace("T", " "), // 可选：数据库自动更新

            };

        let bindBudgetCategory = await this.findById(defaultData.user_id, defaultData.category_id, defaultData.book_id, defaultData.budget_id);
        console.log(bindBudgetCategory)

        try {
            // 2. 执行 UPSERT SQL（核心：仅更新category_amount，其他字段新增时赋值、更新时保留原值）
            const [result] = await pool.execute(
                `INSERT INTO ${this.budgetCategoryTableName}
                 (user_id, book_id, budget_id, category_id, category_amount, sort_order, is_active, created_at,
                  updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        -- 唯一键冲突时，仅更新category_amount和updated_at，其他字段保留原有值
                     ON DUPLICATE KEY
                UPDATE
                    category_amount =
                VALUES (category_amount), -- 仅更新金额字段
                    updated_at =
                VALUES (updated_at) -- 仅更新时间戳
                `,
                [
                    defaultData.user_id,
                    defaultData.book_id,
                    defaultData.budget_id,
                    defaultData.category_id,
                    defaultData.category_amount,
                    defaultData.sort_order,
                    defaultData.is_active,
                    defaultData.created_at,
                    defaultData.updated_at,
                ]
            );

            // 保留你原有返回逻辑：影响行数为1则返回
            if ((result as any).affectedRows >= 1) { // 兼容新增(1)和更新(2)的情况
                return (result as any).affectedRows; // 保持返回值类型为string
            }

        } catch (error: any) {
            throw new HttpError(`创建预算失败：${error.message}`, 500);
        }
    }

    async findById(user_id: number, category_id: number, book_id: number, budget_id: number): Promise<boolean> {
        let querySql = ` SELECT id
                         FROM ${this.budgetCategoryTableName}
                         WHERE user_id = ?
                           AND category_id = ?
                           AND book_id = ?
                           AND budget_id = ?`;
        let queryParams = [user_id, category_id, book_id, budget_id];
        // 执行查询，判断是否存在重复预算
        const [rows] = await pool.execute(querySql, queryParams);
        return Array.isArray(rows) && rows.length === 0; // true=唯一，false=重复
    }


    /**
     * 删除预算分类关联（实际为更新金额和百分比）
     * @param userId 用户ID
     * @param budgetCategoryId 预算分类ID
     * @param categoryId 分类ID
     * @returns 更新结果
     * @throws 业务异常或数据库异常
     */
    async delete(userId: number, budgetCategoryId: number, categoryId: number): Promise<{
        affectedRows: number;
        changedRows: number
    }> {
        // 1. 参数验证
        if (!userId || userId <= 0) {
            throw new Error('无效的用户ID：必须是大于0的数字');
        }
        if (!budgetCategoryId || budgetCategoryId <= 0) {
            throw new Error('无效的预算分类ID：必须是大于0的数字');
        }
        if (!categoryId || categoryId <= 0) {
            throw new Error('无效的分类ID：必须是大于0的数字');
        }

        try {
            // 2. 先查询原始数据（可选：用于日志记录或数据校验）
            const [originalData] = await pool.execute(
                `SELECT category_amount, category_actual_amount
                 FROM ${this.budgetCategoryTableName}
                 WHERE id = ?
                   AND user_id = ?
                   AND category_id = ? LIMIT 1`,
                [budgetCategoryId, userId, categoryId]
            );

            // 类型断言（适配mysql2的返回类型）
            const originalRows = originalData as Array<{
                category_amount: number;
                category_actual_amount: number;
            }>;

            if (originalRows.length === 0) {
                throw new Error(`未找到指定的预算分类记录：ID=${budgetCategoryId}, 用户ID=${userId}, 分类ID=${categoryId}`);
            }

            const originalAmount = originalRows[0].category_amount;
            const originalActualAmount = originalRows[0].category_actual_amount;

            // 3. 计算更新值（将实际金额置为0，重新计算剩余百分比）
            const newActualAmount = 0;
            let remainingPercent = 0;

            if (originalAmount !== 0) {
                remainingPercent = Number(((originalAmount - newActualAmount) / originalAmount * 100).toFixed(2));
            }

            // 4. 执行更新操作（修复原代码参数绑定错误）
            const [result] = await pool.execute(
                `UPDATE ${this.budgetCategoryTableName}
                 SET category_actual_amount = ?,
                     category_amount = ?,
                     remaining_percent      = ?,
                     updated_at             = NOW()
                 WHERE id = ?
                   AND user_id = ?
                   AND category_id = ?`,
                [
                    newActualAmount,    // category_actual_amount
                    0,
                    remainingPercent,   // remaining_percent
                    budgetCategoryId,   // WHERE id
                    userId,             // WHERE user_id
                    categoryId          // WHERE category_id
                ]
            );

            // 类型断言
            const updateResult = result as {
                affectedRows: number;
                changedRows: number;
            };

            // 5. 日志记录（生产环境建议使用日志库如winston/pino）
            console.log(`预算分类更新成功 - 用户ID: ${userId}, 预算分类ID: ${budgetCategoryId}, 分类ID: ${categoryId}, 原实际金额: ${originalActualAmount}, 新实际金额: ${newActualAmount}, 剩余百分比: ${remainingPercent}%, 影响行数: ${updateResult.affectedRows}`
            );

            // 6. 校验更新结果
            if (updateResult.changedRows === 0) {
                console.warn(
                    `预算分类无数据变更 - 用户ID: ${userId}, 预算分类ID: ${budgetCategoryId}, 分类ID: ${categoryId}`
                );
            }

            return updateResult;

        } catch (error) {
            // 7. 错误处理和格式化
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(
                `预算分类更新失败 - 用户ID: ${userId}, 预算分类ID: ${budgetCategoryId}, 分类ID: ${categoryId}, 
         错误信息: ${errorMsg}`
            );

            // 区分业务错误和数据库错误
            if (errorMsg.includes('未找到指定的预算分类记录')) {
                throw new Error(errorMsg); // 业务错误
            } else {
                throw new Error(`数据库操作失败：${errorMsg}`); // 数据库错误
            }
        }
    }

}

export default new BudgetCategoryModule();