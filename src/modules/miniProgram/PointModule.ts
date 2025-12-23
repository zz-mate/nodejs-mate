import pool from '../../db'; // 你的数据库连接池（mysql2/promise）
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

/**
 * 积分限制配置项类型
 * - limitType: 限制类型（lifetime-终身仅N次 / daily-每日N次）
 * - limitCount: 限制次数
 * - remark: 行为备注（前端/日志展示用）
 */
interface PointLimitConfigItem {
    limitType: 'lifetime' | 'daily';
    limitCount: number;
    remark: string;
}

class PointModule {
    // 数据库表名配置
    private userTableName = 'mate_user'; // 用户主表
    private userPointsLogTableName = 'mate_user_points_log'; // 积分变动日志表
    private billTableName = 'mate_bill'; // 账单表（仅作为业务参考）
    private userPointsTableName = 'mate_user_points'; // 用户总积分/可用积分表

    /**
     * 积分奖励频次限制配置
     * 核心规则：
     * - 账单类：每日限制次数
     * - 用户资料类：终身仅1次
     */
    private pointLimitConfig: Record<string, PointLimitConfigItem> = {
        // 账单相关（每日限制）
        bill_add: { limitType: 'daily', limitCount: 1, remark: '新增账单' },
        // 用户资料修改类（终身仅1次）
        profile_bind_mobile: { limitType: 'lifetime', limitCount: 1, remark: '绑定手机号' },
        profile_bind_email: { limitType: 'lifetime', limitCount: 1, remark: '绑定邮箱' },
        profile_complete_realname: { limitType: 'lifetime', limitCount: 1, remark: '完善实名认证' },
        profile_set_pay_pwd: { limitType: 'lifetime', limitCount: 1, remark: '设置支付密码' },
        profile_update_avatar: { limitType: 'lifetime', limitCount: 1, remark: '修改头像' },
        profile_update_nickname: { limitType: 'lifetime', limitCount: 1, remark: '修改昵称' },
        profile_bind_wechat: { limitType: 'lifetime', limitCount: 1, remark: '绑定微信' },
        profile_bind_alipay: { limitType: 'lifetime', limitCount: 1, remark: '绑定支付宝' },
        profile_update_address: { limitType: 'lifetime', limitCount: 1, remark: '修改收货地址' },
        // 其他通用场景（每日限制）
        task_complete: { limitType: 'daily', limitCount: 5, remark: '完成日常任务' },
    };

    /**
     * 新增用户积分（核心方法）
     * @param userId 用户ID
     * @param points 新增积分（正数）
     * @param bizType 业务类型（对应pointLimitConfig的key）
     * @param remark 积分备注（如："绑定手机号奖励积分"）
     * @param bizId 业务ID（可选，如账单ID/手机号ID，防重复发放）
     * @returns 操作结果（含积分信息、限制状态）
     */
    async addPoints(
        userId: number,
        points: number,
        bizType: string,
        remark: string,
        bizId?: string | number
    ): Promise<{
        success: boolean;
        message: string;
        logId?: number; // 积分日志ID
        usedCount?: number; // 已使用次数（终身/今日）
        limitCount?: number; // 限制次数
        limitType?: 'lifetime' | 'daily'; // 限制类型
        availablePoints?: number; // 新增后可用积分
        totalPoints?: number; // 新增后总积分
    }> {
        // 1. 基础参数校验
        if (!userId || !points || !bizType) {
            return { success: false, message: '用户ID、积分、业务类型不能为空' };
        }
        if (points <= 0) {
            return { success: false, message: '新增积分需为正数，扣减积分请调用 deductPoints 方法' };
        }

        // 2. 校验用户是否存在
        const userExist = await this.checkUserExist(userId);
        if (!userExist) {
            return { success: false, message: `用户ID ${userId} 不存在` };
        }

        // 3. 校验行为频次限制（终身/每日）
        const limitCheck = await this.checkActionLimit(userId, bizType);
        // 3.1 输出防刷校验日志（核心需求）
        const bizRemark = this.pointLimitConfig[bizType]?.remark || '该操作';
        const limitDesc = limitCheck.limitType === 'lifetime' ? '终身' : '今日';
        console.log(`积分：防刷校验：用户${userId} 行为${bizRemark} 本次+1 ${limitDesc}累计${limitCheck.usedCount} 上限${limitCheck.limitCount}`);

        // 3.2 校验是否超过限制
        if (!limitCheck.pass) {
            const limitTip = limitCheck.limitType === 'lifetime' ? '终身仅可' : '每日最多';
            console.log(`用户${userId}今日${remark}经验已达上限`);
            return {
                success: false,
                message: `该操作(${bizRemark})${limitTip}操作${limitCheck.limitCount}次，已使用${limitCheck.usedCount}次，无法继续奖励积分`,
                usedCount: limitCheck.usedCount,
                limitCount: limitCheck.limitCount,
                limitType: limitCheck.limitType,
            };
        }

        // 4. 防重复发放（传了bizId才校验）
        if (bizId) {
            const isDuplicate = await this.checkDuplicatePoints(userId, bizType, bizId);
            if (isDuplicate) {
                return {
                    success: false,
                    message: `该业务(${bizType}-${bizId})已发放过积分，请勿重复操作`,
                    usedCount: limitCheck.usedCount,
                    limitCount: limitCheck.limitCount,
                    limitType: limitCheck.limitType,
                };
            }
        }

        // 5. 核心：用户资料类操作终极校验（避免积分日志丢失导致重复奖励）
        if (this.isProfileLifetimeBiz(bizType)) {
            const isProfileCompleted = await this.checkProfileCompleted(userId, bizType);
            if (isProfileCompleted) {
                return {
                    success: false,
                    message: `${bizRemark}已完成，终身仅可操作1次`,
                    usedCount: limitCheck.usedCount,
                    limitCount: limitCheck.limitCount,
                    limitType: limitCheck.limitType,
                };
            }
        }

        // 6. 开启事务：新增积分日志 + 更新总积分/可用积分
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 6.1 插入积分变动日志
            const logSql = `
        INSERT INTO ${this.userPointsLogTableName} 
        (user_id, points, biz_type, biz_id, remark, create_time)
        VALUES (?, ?, ?, ?, ?, NOW())
      `;
            const [logResult] = await connection.execute<ResultSetHeader>(logSql, [
                userId,
                points,
                bizType,
                bizId || null,
                remark,
            ]);
            const logId = logResult.insertId;

            // 6.2 更新用户总积分&可用积分（无则初始化，有则累加）
            const pointsSql = `
        INSERT INTO ${this.userPointsTableName} (user_id, total_points, available_points, update_time)
        VALUES (?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE 
          total_points = total_points + ?,
          available_points = available_points + ?,
          update_time = NOW()
      `;
            await connection.execute<ResultSetHeader>(pointsSql, [
                userId,
                points, // 初始化总积分
                points, // 初始化可用积分
                points, // 累加总积分
                points, // 累加可用积分
            ]);

            // 6.3 查询更新后的积分（返回给调用方）
            const [updatedPoints] = await connection.execute<RowDataPacket[]>(
                `SELECT total_points, available_points FROM ${this.userPointsTableName} WHERE user_id = ? LIMIT 1`,
                [userId]
            );
            const totalPoints = Number(updatedPoints[0]?.total_points) || 0;
            const availablePoints = Number(updatedPoints[0]?.available_points) || 0;

            await connection.commit();
            console.log(`[积分新增成功] 用户${userId} 新增${points}积分，总积分：${totalPoints}，可用积分：${availablePoints}`);
            return {
                success: true,
                message: `成功为用户 ${userId} 新增 ${points} 积分`,
                logId,
                usedCount: limitCheck.usedCount + 1, // 新增后已使用次数+1
                limitCount: limitCheck.limitCount,
                limitType: limitCheck.limitType,
                totalPoints,
                availablePoints,
            };
        } catch (error) {
            await connection.rollback();
            console.error(`[积分新增失败] 用户${userId}`, error);
            return {
                success: false,
                message: `新增积分失败：${(error as Error).message}`,
                usedCount: limitCheck.usedCount,
                limitCount: limitCheck.limitCount,
                limitType: limitCheck.limitType,
            };
        } finally {
            connection.release();
        }
    }

    /**
     * 扣减用户积分（核心方法）
     * @param userId 用户ID
     * @param points 扣减积分（正数）
     * @param bizType 业务类型（如：goods_exchange-商品兑换）
     * @param remark 积分备注
     * @param bizId 业务ID（可选，防重复扣减）
     * @returns 操作结果
     */
    async deductPoints(
        userId: number,
        points: number,
        bizType: string,
        remark: string,
        bizId?: string | number
    ): Promise<{
        success: boolean;
        message: string;
        logId?: number;
        availablePoints?: number;
        totalPoints?: number;
    }> {
        // 1. 基础参数校验
        if (!userId || !points || !bizType) {
            return { success: false, message: '用户ID、扣减积分、业务类型不能为空' };
        }
        if (points <= 0) {
            return { success: false, message: '扣减积分需传入正数' };
        }

        // 2. 校验用户是否存在
        const userExist = await this.checkUserExist(userId);
        if (!userExist) {
            return { success: false, message: `用户ID ${userId} 不存在` };
        }

        // 3. 防重复扣减
        if (bizId) {
            const isDuplicate = await this.checkDuplicatePoints(userId, bizType, bizId);
            if (isDuplicate) {
                return { success: false, message: `该业务(${bizType}-${bizId})已扣减过积分，请勿重复操作` };
            }
        }

        // 4. 校验可用积分是否足够
        const { totalPoints: currentTotal, availablePoints: currentAvailable } = await this.getUserAllPoints(userId);
        if (currentAvailable < points) {
            return {
                success: false,
                message: `用户 ${userId} 可用积分不足（当前：${currentAvailable}，需扣减：${points}）`,
                totalPoints: currentTotal,
                availablePoints: currentAvailable,
            };
        }

        // 5. 开启事务：插入扣减日志 + 更新积分
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 5.1 插入积分扣减日志（负数标识扣减）
            const logSql = `
        INSERT INTO ${this.userPointsLogTableName} 
        (user_id, points, biz_type, biz_id, remark, create_time)
        VALUES (?, ?, ?, ?, ?, NOW())
      `;
            const [logResult] = await connection.execute<ResultSetHeader>(logSql, [
                userId,
                -points, // 扣减记为负数
                bizType,
                bizId || null,
                remark,
            ]);
            const logId = logResult.insertId;

            // 5.2 扣减总积分&可用积分
            const pointsSql = `
        UPDATE ${this.userPointsTableName} 
        SET 
          total_points = total_points - ?,
          available_points = available_points - ?,
          update_time = NOW()
        WHERE user_id = ?
      `;
            await connection.execute<ResultSetHeader>(pointsSql, [points, points, userId]);

            // 5.3 查询扣减后的积分
            const [updatedPoints] = await connection.execute<RowDataPacket[]>(
                `SELECT total_points, available_points FROM ${this.userPointsTableName} WHERE user_id = ? LIMIT 1`,
                [userId]
            );
            const totalPoints = Number(updatedPoints[0]?.total_points) || 0;
            const availablePoints = Number(updatedPoints[0]?.available_points) || 0;

            await connection.commit();
            console.log(`[积分扣减成功] 用户${userId} 扣减${points}积分，总积分：${totalPoints}，可用积分：${availablePoints}`);
            return {
                success: true,
                message: `成功为用户 ${userId} 扣减 ${points} 积分`,
                logId,
                totalPoints,
                availablePoints,
            };
        } catch (error) {
            await connection.rollback();
            console.error(`[积分扣减失败] 用户${userId}`, error);
            return {
                success: false,
                message: `扣减积分失败：${(error as Error).message}`,
            };
        } finally {
            connection.release();
        }
    }

    /**
     * 校验用户是否存在（私有方法）
     */
    private async checkUserExist(userId: number): Promise<boolean> {
        const sql = `SELECT id FROM ${this.userTableName} WHERE id = ? LIMIT 1`;
        const [rows] = await pool.execute<RowDataPacket[]>(sql, [userId]);
        return rows.length > 0;
    }

    /**
     * 校验是否重复操作（新增/扣减）
     */
    private async checkDuplicatePoints(
        userId: number,
        bizType: string,
        bizId: string | number
    ): Promise<boolean> {
        const sql = `
      SELECT id FROM ${this.userPointsLogTableName}
      WHERE user_id = ? AND biz_type = ? AND biz_id = ? LIMIT 1
    `;
        const [rows] = await pool.execute<RowDataPacket[]>(sql, [userId, bizType, bizId]);
        return rows.length > 0;
    }

    /**
     * 校验用户某业务类型的积分奖励频次（支持终身/每日限制）
     */
    private async checkActionLimit(
        userId: number,
        bizType: string
    ): Promise<{
        pass: boolean; // 是否通过限制校验
        usedCount: number; // 已使用次数（终身/今日）
        limitCount: number; // 限制次数
        limitType: 'lifetime' | 'daily'; // 限制类型
    }> {
        // 1. 获取限制配置（无配置则不限制）
        const config = this.pointLimitConfig[bizType];
        const limitType = config?.limitType || 'daily';
        const limitCount = config?.limitCount || Infinity;

        if (limitCount === Infinity) {
            return { pass: true, usedCount: 0, limitCount, limitType };
        }

        // 2. 构造统计SQL（区分终身/每日）
        let timeWhere = '';
        if (limitType === 'daily') {
            timeWhere = 'AND DATE(create_time) = CURDATE()'; // 每日限制：仅统计今日
        }

        const sql = `
      SELECT COUNT(*) AS count 
      FROM ${this.userPointsLogTableName} 
      WHERE user_id = ? 
        AND biz_type = ? 
        ${timeWhere}
        AND points > 0 -- 仅统计新增积分（排除扣减）
    `;
        const [rows] = await pool.execute<RowDataPacket[]>(sql, [userId, bizType]);
        const usedCount = Number(rows[0].count) || 0;

        // 3. 判断是否超过限制
        const pass = usedCount < limitCount;
        return { pass, usedCount, limitCount, limitType };
    }

    /**
     * 判断是否为用户资料类终身限制业务
     */
    private isProfileLifetimeBiz(bizType: string): boolean {
        return bizType.startsWith('profile_') && this.pointLimitConfig[bizType]?.limitType === 'lifetime';
    }

    /**
     * 校验用户资料是否已完成（终极校验，基于用户表）
     */
    private async checkProfileCompleted(userId: number, bizType: string): Promise<boolean> {
        let checkSql = '';
        switch (bizType) {
            case 'profile_bind_mobile':
                checkSql = `SELECT mobile FROM ${this.userTableName} WHERE id = ? AND mobile IS NOT NULL AND mobile != '' LIMIT 1`;
                break;
            case 'profile_bind_email':
                checkSql = `SELECT email FROM ${this.userTableName} WHERE id = ? AND email IS NOT NULL AND email != '' LIMIT 1`;
                break;
            case 'profile_complete_realname':
                checkSql = `SELECT real_name FROM ${this.userTableName} WHERE id = ? AND real_name IS NOT NULL AND real_name != '' LIMIT 1`;
                break;
            case 'profile_set_pay_pwd':
                checkSql = `SELECT pay_pwd FROM ${this.userTableName} WHERE id = ? AND pay_pwd IS NOT NULL AND pay_pwd != '' LIMIT 1`;
                break;
            case 'profile_bind_wechat':
                checkSql = `SELECT wechat FROM ${this.userTableName} WHERE id = ? AND wechat IS NOT NULL AND wechat != '' LIMIT 1`;
                break;
            case 'profile_bind_alipay':
                checkSql = `SELECT alipay FROM ${this.userTableName} WHERE id = ? AND alipay IS NOT NULL AND alipay != '' LIMIT 1`;
                break;
            default:
                return false; // 其他资料类操作可自行扩展
        }

        const [rows] = await pool.execute<RowDataPacket[]>(checkSql, [userId]);
        return rows.length > 0;
    }

    /**
     * 查询用户总积分&可用积分
     */
    async getUserAllPoints(userId: number): Promise<{
        totalPoints: number;
        availablePoints: number;
    }> {
        const sql = `
      SELECT total_points, available_points 
      FROM ${this.userPointsTableName} 
      WHERE user_id = ? LIMIT 1
    `;
        const [rows] = await pool.execute<RowDataPacket[]>(sql, [userId]);
        if (rows.length === 0) {
            return { totalPoints: 0, availablePoints: 0 };
        }
        return {
            totalPoints: Number(rows[0].total_points) || 0,
            availablePoints: Number(rows[0].available_points) || 0,
        };
    }

    /**
     * 兼容原有方法：仅查询总积分
     */
    async getUserTotalPoints(userId: number): Promise<number> {
        const { totalPoints } = await this.getUserAllPoints(userId);
        return totalPoints;
    }

    /**
     * 查询用户某业务类型的积分奖励使用状态（兼容终身/每日）
     */
    async getActionLimitStatus(userId: number, bizType: string): Promise<{
        usedCount: number;
        remainCount: number;
        limitCount: number;
        limitType: 'lifetime' | 'daily';
    }> {
        const limitCheck = await this.checkActionLimit(userId, bizType);
        const remainCount = Math.max(0, limitCheck.limitCount - limitCheck.usedCount);
        return {
            usedCount: limitCheck.usedCount,
            remainCount,
            limitCount: limitCheck.limitCount,
            limitType: limitCheck.limitType,
        };
    }

    /**
     * 保留原有方法：兼容旧代码调用
     */
    async getDailyLimitStatus(userId: number, bizType: string): Promise<{
        todayUsed: number;
        remain: number;
        dailyLimit: number;
    }> {
        const status = await this.getActionLimitStatus(userId, bizType);
        return {
            todayUsed: status.usedCount,
            remain: status.remainCount,
            dailyLimit: status.limitCount,
        };
    }

}

// 导出单例
export default new PointModule();