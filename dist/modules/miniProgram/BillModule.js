import pool from '../../db/index.ts';
import { v4 as uuidv4 } from "uuid";
class BillModule {
    constructor() {
        this.billTableName = 'mate_bill';
    }
    async create(params) {
        // 1. 构造完全匹配表结构的默认数据
        const defaultData = {
            uuid: uuidv4(),
            user_id: params.user_id,
            book_id: params.book_id,
            category_id: params.category_id,
            amount: params.amount,
            type: params.type,
            currency: params.currency || 'CNY',
            bill_time: params.bill_time,
            tags: params.tags || null,
            created_at: new Date().toISOString().slice(0, 19).replace("T", " "), // 可选：数据库自动生成，也可手动传
            updated_at: new Date().toISOString().slice(0, 19).replace("T", " "), // 可选：数据库自动更新
        };
        try {
            // 2. 执行插入SQL（字段名/数量100%匹配最新表结构）
            const [result] = await pool.execute(`INSERT INTO ${this.billTableName}
                 (uuid, user_id, book_id, category_id, amount, type, currency, bill_time, tags, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                defaultData.uuid = uuidv4(),
                defaultData.user_id,
                defaultData.book_id,
                defaultData.category_id,
                defaultData.amount,
                defaultData.type,
                defaultData.currency,
                defaultData.bill_time,
                defaultData.tags,
                defaultData.created_at,
                defaultData.updated_at,
            ]);
            // 3. 判断是否新增
            if (result.affectedRows == 1) {
                return result.affectedRows;
            }
        }
        catch (error) {
            // 针对性捕获常见错误
            const err = error;
            if (err.code === "ER_NO_REFERENCED_ROW_2") {
                console.error("❌ 外键错误：default_book_id不存在（mate_book表中无此ID）");
            }
            else if (err.code === "ER_DUP_ENTRY") {
                console.error("❌ 唯一键冲突：username/phone/uuid/email已存在");
            }
            else {
                console.error("❌ 插入失败：", err.message);
            }
            throw err;
        }
    }
}
export default new BillModule();
