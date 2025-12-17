import pool from '../../db/index.ts';
class BillModule {
    constructor() {
        this.budgetTableName = 'mate_budget';
        this.billTableName = 'mate_bill';
    }
    /**
     * 创建预算
     * @param params
     */
    async create(params) {
        /**
         * 1- 暂无账单：新建账单正常新增
         * 2- 有账单：通过预算周期开始日期 - 预算结束日期 取筛选 支出总金额
         */
        // 1. 构造完全匹配表结构的默认数据
        const defaultData = {
            user_id: params.user_id,
            book_id: params.book_id,
            amount: params.amount,
            cycle_type: params.cycle_type,
            cycle_start: params.cycle_start,
            cycle_end: params.cycle_end,
            sort_order: params.sort_order || 99,
            is_active: params.is_active || 1,
            created_at: new Date().toISOString().slice(0, 19).replace("T", " "), // 可选：数据库自动生成，也可手动传
            updated_at: new Date().toISOString().slice(0, 19).replace("T", " "), // 可选：数据库自动更新
        };
        try {
            // 2. 执行插入SQL（字段名/数量100%匹配最新表结构）
            const [result] = await pool.execute(`INSERT INTO ${this.budgetTableName}
                 (user_id, book_id, amount, cycle_type, cycle_start, cycle_end, sort_order, is_active, created_at,
                  updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                defaultData.user_id,
                defaultData.book_id,
                defaultData.amount,
                defaultData.cycle_type,
                defaultData.cycle_start,
                defaultData.cycle_end,
                defaultData.sort_order,
                defaultData.is_active,
                defaultData.created_at,
                defaultData.updated_at,
            ]);
            // 3.根据日期查询 获取已经消费的金额
            let actual_amount = await this.getActualAmount(defaultData.user_id, defaultData.book_id, defaultData.cycle_start, defaultData.cycle_end);
            console.log(actual_amount, "actual_amount");
            await pool.execute(`UPDATE ${this.budgetTableName}
                 SET actual_amount = ?
                 WHERE id = ?`, [actual_amount, result.insertId]);
            if (result.affectedRows == 1) {
                return result.affectedRows;
            }
        }
        catch (error) {
            // 针对性捕获常见错误
            const err = error;
            throw err;
        }
    }
    /**
     * 查询指定条件下的支出类总金额
     * @param {number} user_id - 用户ID（必传）
     * @param {number} book_id - 账本ID（必传）
     * @param {string} cycle_start - 周期开始日期（格式：YYYY-MM-DD）
     * @param {string} cycle_end - 周期结束日期（格式：YYYY-MM-DD）
     * @returns {Promise<number>} 支出类总金额（保留2位小数）
     */
    async getActualAmount(user_id, book_id, cycle_start, cycle_end) {
        // 1. 参数校验（避免无效查询）
        if (!user_id || !book_id || !cycle_start || !cycle_end) {
            throw new Error('参数错误：user_id、book_id、cycle_start、cycle_end 均为必填项');
        }
        // 简单校验日期格式（YYYY-MM-DD）
        const dateReg = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateReg.test(cycle_start) || !dateReg.test(cycle_end)) {
            throw new Error('日期格式错误：请传入 YYYY-MM-DD 格式的日期');
        }
        try {
            // 3. 执行查询（使用预处理语句防SQL注入）
            const [rows] = await pool.execute(`SELECT IFNULL(SUM(amount), 0) AS total_expense
                 FROM ${this.billTableName}
                 WHERE user_id = ?
                   AND book_id = ?
                   AND type = 2 -- 仅计算支出类
                   AND bill_time BETWEEN ? AND ?`, // 假设账单表的日期字段为 bill_date，可根据实际字段名调整
            [user_id, book_id, cycle_start, cycle_end]);
            // 4. 处理结果（转为数字并保留2位小数）
            // @ts-ignore
            const totalExpense = parseFloat(rows[0].total_expense).toFixed(2);
            return Number(totalExpense); // 转为数字类型返回
        }
        catch (error) {
            console.error('查询支出总金额失败：', error);
            // @ts-ignore
            throw new Error(`查询失败：${error.message}`);
        }
    }
    /**
     * 查询指定条件下是否存在预算记录
     * @param user_id - 用户ID（必传，大于0的数字）
     * @param book_id - 账本ID（必传，大于0的数字）
     * @param cycle_type - 预算周期类型（必传，如 'day'/'week'/'month'/'year'/'custom'）
     * @param cycle_start - 周期开始日期（必传，格式：YYYY-MM-DD）
     * @param cycle_end - 周期结束日期（必传，格式：YYYY-MM-DD）
     * @returns Promise<boolean> - 存在返回true，不存在返回false
     */
    async findById(user_id, book_id, cycle_type, cycle_start, cycle_end) {
        // 1. 严格参数校验
        // 校验ID参数
        if (typeof user_id !== 'number' || user_id <= 0) {
            throw new Error('参数错误：user_id 必须是大于0的数字');
        }
        if (typeof book_id !== 'number' || book_id <= 0) {
            throw new Error('参数错误：book_id 必须是大于0的数字');
        }
        // 校验周期类型
        const validCycleTypes = ['day', 'week', 'month', 'year', 'custom'];
        if (!cycle_type || !validCycleTypes.includes(cycle_type)) {
            throw new Error(`参数错误：cycle_type 必须是 ${validCycleTypes.join('/')} 中的一个`);
        }
        // 校验日期格式（YYYY-MM-DD）
        const dateReg = /^\d{4}-\d{2}-\d{2}$/;
        if (!cycle_start || !dateReg.test(cycle_start)) {
            throw new Error('参数错误：cycle_start 必须是 YYYY-MM-DD 格式的日期');
        }
        if (!cycle_end || !dateReg.test(cycle_end)) {
            throw new Error('参数错误：cycle_end 必须是 YYYY-MM-DD 格式的日期');
        }
        try {
            // 2. 获取数据库连接
            // 3. 执行精准查询（新增cycle_type/cycle_start/cycle_end条件，LIMIT 1优化性能）
            const [rows] = await pool.execute(`SELECT 1 FROM mate_budget 
       WHERE user_id = ? 
         AND book_id = ? 
         AND cycle_type = ? 
         AND cycle_start = ? 
         AND cycle_end = ? 
       LIMIT 1`, [user_id, book_id, cycle_type, cycle_start, cycle_end]);
            // 4. 处理结果：有记录返回true，无记录返回false
            const exists = Array.isArray(rows) && rows.length > 0;
            return exists;
        }
        catch (error) {
            console.error('查询预算是否存在失败：', error);
            throw new Error(`查询预算失败：${error.message}`);
        }
    }
}
export default new BillModule();
