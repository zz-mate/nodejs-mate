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

        let bindBudgetCategory = await this.findById(defaultData.user_id,defaultData.category_id,defaultData.book_id,defaultData.budget_id);
        console.log(bindBudgetCategory)

        try {
            // 2. 执行 UPSERT SQL（核心：仅更新category_amount，其他字段新增时赋值、更新时保留原值）
            const [result] = await pool.execute(
                `INSERT INTO ${this.budgetCategoryTableName}
             (user_id, book_id, budget_id, category_id, category_amount, sort_order, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             -- 唯一键冲突时，仅更新category_amount和updated_at，其他字段保留原有值
             ON DUPLICATE KEY UPDATE
               category_amount = VALUES(category_amount),  -- 仅更新金额字段
               updated_at = VALUES(updated_at)             -- 仅更新时间戳
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

    async findById(user_id:number,category_id:number, book_id:number,budget_id:number):Promise<boolean>{
        let querySql = ` SELECT id FROM ${this.budgetCategoryTableName} WHERE  user_id=? AND category_id = ? AND book_id = ? AND budget_id = ?`;
        let queryParams =[user_id,category_id, book_id, budget_id];
        // 执行查询，判断是否存在重复预算
        const [rows] = await pool.execute(querySql, queryParams);
        return  Array.isArray(rows) && rows.length === 0; // true=唯一，false=重复
    }


}

export default new BudgetCategoryModule();