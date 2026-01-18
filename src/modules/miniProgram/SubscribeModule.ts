// 引入 MySQL 连接池（请替换为你实际的连接池配置路径）
import pool from '../../db';

class SubscribeModule {
    // 订阅记录表名
    subscribeRecordTableName = "mate_subscribe_record";

    /**
     * 查询所有订阅记录（适配 pool.execute 实现）
     * @returns 所有订阅记录
     */
    async findAll() {
        try {
            const [rows] = await pool.execute(
                `SELECT * FROM ${this.subscribeRecordTableName}`
            );
            return rows;
        } catch (error) {
            console.error('查询所有订阅记录失败：', error);
            throw new Error('查询订阅记录失败');
        }
    }

    /**
     * 检查用户是否已订阅指定模板（基于 pool.execute 实现）
     * @param openid 用户唯一标识
     * @param template_id 订阅消息模板ID
     * @returns boolean - true:已订阅，false:未订阅
     */
    async isSubscribe(openid: string, template_id: string) {
        // 1. 参数校验：避免空值导致数据库查询错误
        if (!openid || !template_id) {
            console.error('isSubscribe参数错误：openid或template_id为空');
            return false;
        }

        try {
            // 2. 执行数据库查询（mysql2 的 pool.execute 返回 [rows, fields]）
            const [rows] = await pool.execute(
                `SELECT * FROM ${this.subscribeRecordTableName}
                 WHERE openid = ? AND template_id = ? AND is_enabled = 1
                     LIMIT 1`,
                [openid, template_id] // 参数绑定，防止SQL注入
            );

            // 3. 判断结果：rows是数组，有数据则说明已订阅
            // 注意：mysql2 返回的 rows 是数组，需判断长度而非直接 !!rows
            return Array.isArray(rows) && rows.length > 0;
        } catch (error) {
            // 4. 异常捕获：避免程序崩溃，默认返回未订阅
            console.error('检查订阅状态失败：', error);
            return false;
        }
    }
}

export default new SubscribeModule();