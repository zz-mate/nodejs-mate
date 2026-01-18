import pool from "../../db";

// 定义前端卡片所需的数据类型
interface AnalyticsCardItem {
    icon: string; // 前端图标组件标识（保持与前端一致的命名）
    title: string;
    totalTitle: string;
    totalValue: number; // 全局总数
    value: number; // 新增数量（默认按今日新增统计）
}

// 统一返回结果类型
interface AnalyticsResult {
    code: number;
    message: string;
    data: AnalyticsCardItem[];
}

class AnalyticsModule {
    private readonly billTableName = "mate_bill";
    private readonly userTableName = "mate_user";

    /**
     * 获取前端可视化卡片数据（总数量+新增数量）
     * @param dateType 新增数量的统计维度：today（今日）/week（本周）/month（本月），默认today
     * @returns 适配前端的结构化数据
     */
    async getAnalyticsCards(dateType: 'today' | 'week' | 'month' = 'today'): Promise<AnalyticsResult> {
        let connection;
        try {
            connection = await pool.getConnection();

            // ========== 1. 构建新增数量的时间条件 ==========
            let dateWhereSql = '';
            switch (dateType) {
                case 'today':
                    // 今日：bill_time/created_at 大于等于今天0点
                    dateWhereSql = " AND DATE(bill_time) = CURDATE() ";
                    break;
                case 'week':
                    // 本周：bill_time/created_at 在本周一到周日
                    dateWhereSql = " AND YEARWEEK(DATE(bill_time), 1) = YEARWEEK(CURDATE(), 1) ";
                    break;
                case 'month':
                    // 本月：bill_time/created_at 在本月
                    dateWhereSql = " AND DATE_FORMAT(bill_time, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m') ";
                    break;
            }
            // ========== 2. 统计各维度数据 ==========
            // 2.1 总用户数 + 今日新增用户数
            const [totalUserResult] = await connection.execute(`
        SELECT COUNT(*) AS total FROM ${this.userTableName} WHERE  is_active = 1
      `);
            const totalUser = Number((totalUserResult as any[])[0].total) || 0;

            const [newUserResult] = await connection.execute(`
        SELECT COUNT(*) AS newCount FROM ${this.userTableName} 
        WHERE  is_active = 1 AND DATE(created_at) = CURDATE()
      `);
            const newUser = Number((newUserResult as any[])[0].newCount) || 0;

            // 2.2 总账单数 + 今日新增账单数
            const [totalBillResult] = await connection.execute(`
        SELECT COUNT(*) AS total FROM ${this.billTableName} WHERE is_deleted = 0
      `);
            const totalBill = Number((totalBillResult as any[])[0].total) || 0;

            const [newBillResult] = await connection.execute(`
        SELECT COUNT(*) AS newCount FROM ${this.billTableName} 
        WHERE is_deleted = 0 ${dateWhereSql}
      `);
            const newBill = Number((newBillResult as any[])[0].newCount) || 0;

            // 2.3 总访问量/总使用量（注：需根据实际表结构调整，此处先给示例值，可替换为真实统计逻辑）
            // 若有访问量/使用量表，替换以下SQL即可
            const totalVisit = 500_000; // 示例：全局总访问量
            const newVisit = 20_000;    // 示例：今日新增访问量
            const totalUsage = 50_000;  // 示例：全局总使用量
            const newUsage = 5000;      // 示例：今日新增使用量

            // ========== 3. 组装前端所需的卡片数据 ==========
            const cardData: AnalyticsCardItem[] = [
                {
                    icon: 'SvgCardIcon', // 与前端图标组件名一致
                    title: '用户量',
                    totalTitle: '总用户量',
                    totalValue: totalUser,
                    value: newUser,
                },
                {
                    icon: 'SvgCakeIcon',
                    title: '访问',
                    totalTitle: '总访问量',
                    totalValue: totalVisit,
                    value: newVisit,
                },
                {
                    icon: 'SvgDownloadIcon',
                    title: '账单',
                    totalTitle: '总账单数量',
                    totalValue: totalBill,
                    value: newBill,
                },
                {
                    icon: 'SvgBellIcon',
                    title: '使用量',
                    totalTitle: '总使用量',
                    totalValue: totalUsage,
                    value: newUsage,
                },
            ];

            return {
                code: 0,
                message: "获取可视化卡片数据成功",
                data: cardData
            };
        } catch (e) {
            console.error("获取可视化卡片数据失败：", e);
            // 错误兜底：返回空数据，避免前端报错
            return {
                code: 500,
                message: `获取数据失败：${(e as Error).message}`,
                data: [
                    { icon: 'SvgCardIcon', title: '用户', totalTitle: '总用户量', totalValue: 0, value: 0 },
                    { icon: 'SvgCakeIcon', title: '访问', totalTitle: '总访问量', totalValue: 0, value: 0 },
                    { icon: 'SvgDownloadIcon', title: '账单', totalTitle: '总账单数量', totalValue: 0, value: 0 },
                    { icon: 'SvgBellIcon', title: '使用量', totalTitle: '总使用量', totalValue: 0, value: 0 },
                ]
            };
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    /**
     * 扩展：单独获取总数量（兼容之前的需求）
     */
    async getTotalCount() {
        const result = await this.getAnalyticsCards();
        const totalData = {
            totalUser: result.data[0].totalValue,
            totalBill: result.data[2].totalValue,
            totalVisit: result.data[1].totalValue,
            totalUsage: result.data[3].totalValue,
        };
        return {
            code: result.code,
            message: result.message,
            data: totalData
        };
    }
}

export default new AnalyticsModule();