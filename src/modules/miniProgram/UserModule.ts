import pool from '../../db';
import type {UserDbSchema, UserQRContent, QRCodeConfig, UserProfile} from "../../types";
import {maskPhoneNumber} from "../../utils/tools";
import { generateUserQRCode } from '../../utils/qrcode';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

/**
 * 经验限制配置项类型
 * - limitType: 限制类型（lifetime-终身仅N次 / daily-每日N次）
 * - limitCount: 限制次数
 * - expValue: 该行为对应的经验值
 * - remark: 行为备注（日志/前端展示用）
 */
interface ExpLimitConfigItem {
    limitType: 'lifetime' | 'daily';
    limitCount: number;
    expValue: number;
    remark: string;
}

class UserModule {
    // 表名定义
    userTableName = 'mate_user';
    userProfileTableName = 'mate_user_profile';
    billTableName = 'mate_bill';
    userLevelRuleTableName = 'mate_user_level_rule';
    userExpLogTableName = 'mate_user_exp_log'; // 经验日志表（新增source_id字段）
    userPointsTableName = 'mate_user_points'; // 用户总积分/可用积分表

    /**
     * 经验奖励规则配置（和积分模块对齐）
     * 核心规则：
     * - 高频行为（记账、登录）：每日限制
     * - 低频行为（完善资料、新用户）：终身仅1次
     */
    private expLimitConfig: Record<string, ExpLimitConfigItem> = {
        // 高频行为 - 每日限制
        bill_add: { limitType: 'daily', limitCount: 1, expValue: 1, remark: '新增账单' },
        login_continuous: { limitType: 'daily', limitCount: 1, expValue: 10, remark: '连续登录' },
        category_custom_use: { limitType: 'daily', limitCount: 1, expValue: 1, remark: '使用自定义分类' },
        bill_export: { limitType: 'daily', limitCount: 1, expValue: 20, remark: '导出账单数据' },
        login_7_days: { limitType: 'daily', limitCount: 1, expValue: 50, remark: '连续登录7天奖励' },
        login_30_days: { limitType: 'daily', limitCount: 1, expValue: 200, remark: '连续登录30天奖励' },
        book_create: { limitType: 'daily', limitCount: 1, expValue: 1, remark: '创建多账本' },

        // 低频行为 - 终身仅1次
        profile_email_complete: { limitType: 'lifetime', limitCount: 1, expValue: 20, remark: '完善邮箱信息' },
        profile_avatar_complete: { limitType: 'lifetime', limitCount: 1, expValue: 15, remark: '完善头像信息' },
        profile_info_complete: { limitType: 'lifetime', limitCount: 1, expValue: 10, remark: '完善生日/性别信息' },
        user_newbie: { limitType: 'lifetime', limitCount: 1, expValue: 100, remark: '新用户注册奖励' },
    };

    /**
     * 基础查询：通过ID查找用户（非事务 → pool.execute）
     * @param user_id 用户ID
     * @returns 用户基础信息
     */
    async findById(user_id: number): Promise<UserDbSchema | null> {
        const [rows] = await pool.execute(
            `SELECT id FROM ${this.userTableName} WHERE id = ? LIMIT 1`,
            [user_id]
        );
        const user = (rows as UserDbSchema[])[0];
        return user || null;
    }

    /**
     * 生成用户ID对应的二维码（非事务 → pool.execute）
     * @param userId 用户ID
     * @param config 二维码配置
     */
    async generateUserQRCodeById(
        userId: number,
        config: QRCodeConfig = {}
    ): Promise<string> {
        const [rows] = await pool.execute(
            `SELECT id,avatar,nickname,default_book_id FROM ${this.userTableName} WHERE id = ? LIMIT 1`,
            [userId]
        );
        const user = (rows as UserDbSchema[])[0];
        const bookId = user?.default_book_id || 0;
        return generateUserQRCode(userId, bookId, {}, config);
    };

    /**
     * 计算等级进度百分比
     */
    calculateLevelProgressPercent(userExp: number, currentLevelMinExp: number) {
        if (currentLevelMinExp <= 0) {
            return userExp > 0 ? 100.0 : 0.0;
        }
        let percent = (userExp / currentLevelMinExp) * 100;
        percent = Math.max(0, Math.min(100, percent));
        return Number(percent.toFixed(1));
    }

    /**
     * 核心方法：获取用户完整信息（含等级、统计、自动更新）
     */
    async info(userId: number): Promise<(UserDbSchema & {
        gender_text: string;
        pointsInfo: any;
        levelInfo: any;
        total_used_days: number;
        continuous_used_days: number;
        total_bill_count: number;
    }) | null> {
        let connection: any = null;
        try {
            // 非事务前置查询：用户基础信息
            const [userRows] = await pool.execute(
                `SELECT id,uuid,username,email,phone,nickname,avatar,gender,birthday,default_book_id,is_active,created_at,updated_at
                 FROM ${this.userTableName} WHERE id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1`,
                [userId]
            );
            const user = (userRows as UserDbSchema[])[0];
            if (!user) return null;

            // 非事务查询：记账笔数
            const [billCountRows] = await pool.execute(
                `SELECT COUNT(*) as total_count FROM ${this.billTableName} WHERE user_id = ? AND is_deleted = 0`,
                [userId]
            );
            const totalBillCount = (billCountRows as any[])[0].total_count || 0;

            // 计算注册天数
            const registerTime = user.created_at;
            const currentTime = new Date();
            // @ts-ignore
            const totalUsedDays = Math.floor((currentTime.getTime() - new Date(registerTime).getTime()) / (1000 * 60 * 60 * 24)) + 1;

            // 开启事务
            connection = await pool.getConnection();
            await connection.beginTransaction();

            // 查询/更新用户档案
            const [profileRows] = await connection.execute(
                `SELECT id, level, level_exp, last_login_time, continuous_used_days FROM ${this.userProfileTableName} WHERE user_id = ? LIMIT 1`,
                [userId]
            );
            const profileExist = (profileRows as any[]).length > 0;
            let userLevel = 1;
            let userLevelExp = 0;
            let continuousUsedDays = 1;

            if (profileExist) {
                const profile = (profileRows as any[])[0];
                userLevel = profile.level;
                userLevelExp = profile.level_exp;
                const lastLoginTime = profile.last_login_time;
                const oldContinuousDays = profile.continuous_used_days || 0;

                if (lastLoginTime) {
                    const lastLoginDate = new Date(lastLoginTime);
                    const diffDays = Math.floor((currentTime.getTime() - lastLoginDate.getTime()) / (1000 * 60 * 60 * 24));
                    continuousUsedDays = diffDays === 1 ? oldContinuousDays + 1 : 1;
                }

                // 更新统计信息
                await connection.execute(
                    `UPDATE ${this.userProfileTableName}
                     SET last_login_time = NOW(), total_used_days = ?, continuous_used_days = ?, total_bill_count = ?, updated_at = NOW()
                     WHERE user_id = ?`,
                    [totalUsedDays, continuousUsedDays, totalBillCount, userId]
                );
            } else {
                // 插入初始数据
                await connection.execute(
                    `INSERT INTO ${this.userProfileTableName}
                     (user_id, level, level_exp, register_time, last_login_time, total_used_days, continuous_used_days, total_bill_count,
                      month_bill_count, total_income, total_expense, total_book_count, favorite_category_ids, is_vip, vip_expire_time,
                      remark, created_at, updated_at, is_deleted)
                     VALUES (?, 1, 0, ?, NOW(), ?, 1, ?, 0, 0.00, 0.00, 1, '', 0, null, '', NOW(), NOW(), 0)`,
                    [userId, registerTime, totalUsedDays, totalBillCount]
                );

                // 新用户奖励（终身仅1次）
                await this.addExpByBizType(userId, 'user_newbie', null);
            }

            // 连续登录奖励（按规则校验）
            if (continuousUsedDays === 7) {
                await this.addExpByBizType(userId, 'login_7_days', null);
            }
            if (continuousUsedDays === 30) {
                await this.addExpByBizType(userId, 'login_30_days', null);
            }

            // 查询更新后经验
            const [updatedProfile] = await connection.execute(
                `SELECT level, level_exp FROM ${this.userProfileTableName} WHERE user_id = ? LIMIT 1`,
                [userId]
            );
            userLevel = (updatedProfile as any[])[0]?.level || 1;
            userLevelExp = (updatedProfile as any[])[0]?.level_exp || 0;

            // 检查等级升级
            await this.checkUserLevelUp(userId, userLevelExp, connection);

            // 最终等级查询
            const [finalProfile] = await connection.execute(
                `SELECT level, level_exp FROM ${this.userProfileTableName} WHERE user_id = ? LIMIT 1`,
                [userId]
            );
            userLevel = (finalProfile as any[])[0]?.level || 1;
            userLevelExp = (finalProfile as any[])[0]?.level_exp || 0;

            // 提交事务
            await connection.commit();

            // 查询等级规则和积分信息
            const [levelRuleRows] = await pool.execute(
                `SELECT level_name, min_exp, privileges, icon FROM ${this.userLevelRuleTableName} WHERE id = ? LIMIT 1`,
                [userLevel]
            );
            const levelInfo = (levelRuleRows as any[])[0] || {
                level_name: '新手', min_exp: 100, privileges: '基础记账、1个账本', icon: '', userLevelExp: 0, userLevel: 0
            };
            const [pointRows] = await pool.execute(
                `SELECT * FROM ${this.userPointsTableName} WHERE user_id = ? LIMIT 1`,
                [userId]
            );
            const pointsInfo = (pointRows as any[])[0];

            // 性别映射
            // @ts-ignore
            const genderText = { 1: '男', 2: '女' }[user.gender] || '未知';

            return {
                ...user,
                phone: maskPhoneNumber(typeof user.phone === "string" ? user.phone : ''),
                gender_text: genderText,
                pointsInfo,
                levelInfo: {
                    ...levelInfo,
                    user_level_exp: userLevelExp,
                    user_level: userLevel,
                    LevelProgress: this.calculateLevelProgressPercent(userLevelExp, levelInfo.min_exp)
                },
                total_used_days: totalUsedDays,
                continuous_used_days: continuousUsedDays,
                total_bill_count: totalBillCount
            };

        } catch (error) {
            if (connection) await connection.rollback().catch((err: any) => console.error("事务回滚失败：", err));
            console.error("获取/更新用户信息失败：", { userId, error: (error as Error).message });
            throw new Error(`获取用户信息失败：${(error as Error).message}`);
        } finally {
            if (connection) connection.release();
        }
    }

    /**
     * 按业务类型添加经验（核心入口，兼容每日/终身规则）
     * @param userId 用户ID
     * @param bizType 业务类型（对应expLimitConfig的key）
     * @param sourceId 来源ID（账单ID/分类ID等）
     * @returns 操作结果
     */
    async addExpByBizType(
        userId: number,
        bizType: string,
        sourceId: number | null = null
    ): Promise<{
        success: boolean;
        message: string;
        usedCount?: number;
        limitCount?: number;
        limitType?: 'lifetime' | 'daily';
        newExp?: number;
    }> {
        // 1. 校验业务配置是否存在
        const config = this.expLimitConfig[bizType];
        if (!config) {
            return { success: false, message: `未配置${bizType}对应的经验规则` };
        }

        // 2. 校验用户是否存在
        const userExist = await this.checkUserExist(userId);
        if (!userExist) {
            return { success: false, message: `用户ID ${userId} 不存在` };
        }

        // 3. 校验行为频次限制（核心规则）
        const limitCheck = await this.checkExpActionLimit(userId, bizType);
        const bizRemark = config.remark;
        const limitDesc = limitCheck.limitType === 'lifetime' ? '终身' : '今日';

        // 3.1 防刷日志（和积分模块格式一致）
        console.log(`经验：防刷校验：用户${userId} 行为${bizRemark} 本次+${config.expValue} ${limitDesc}累计${limitCheck.usedCount} 上限${limitCheck.limitCount}`);

        // 3.2 校验不通过直接返回
        if (!limitCheck.pass) {
            const limitTip = limitCheck.limitType === 'lifetime' ? '终身仅可' : '每日最多';
            const message = `用户${userId}${limitDesc}${bizRemark}奖励经验已达上限（${limitTip}操作${limitCheck.limitCount}次，已使用${limitCheck.usedCount}次）`;
            console.log(message);
            return {
                success: false,
                message,
                usedCount: limitCheck.usedCount,
                limitCount: limitCheck.limitCount,
                limitType: limitCheck.limitType
            };
        }

        // 4. 开启事务添加经验
        let connection: any = null;
        try {
            connection = await pool.getConnection();
            await connection.beginTransaction();

            // 4.1 复用原有经验更新逻辑
            await this.updateUserExpWithConn(
                userId,
                config.expValue,
                bizRemark,
                connection,
                sourceId
            );

            // 4.2 检查等级升级
            const [profileRows] = await connection.execute(
                `SELECT level_exp FROM ${this.userProfileTableName} WHERE user_id = ? LIMIT 1`,
                [userId]
            );
            const newExp = (profileRows as any[])[0]?.level_exp || 0;
            await this.checkUserLevelUp(userId, newExp, connection);

            await connection.commit();

            console.log(`[经验新增成功] 用户${userId} 行为${bizRemark} 新增${config.expValue}经验 当前经验${newExp}`);
            return {
                success: true,
                message: `成功为用户${userId}添加${config.expValue}经验（${bizRemark}）`,
                usedCount: limitCheck.usedCount + 1,
                limitCount: limitCheck.limitCount,
                limitType: limitCheck.limitType,
                newExp
            };
        } catch (error) {
            if (connection) await connection.rollback().catch((err: any) => console.error("经验更新回滚失败：", err));
            console.error(`[经验新增失败] 用户${userId} 行为${bizRemark}`, error);
            return {
                success: false,
                message: `添加经验失败：${(error as Error).message}`,
                usedCount: limitCheck.usedCount,
                limitCount: limitCheck.limitCount,
                limitType: limitCheck.limitType
            };
        } finally {
            if (connection) connection.release();
        }
    }

    /**
     * 校验用户是否存在
     */
    private async checkUserExist(userId: number): Promise<boolean> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT id FROM ${this.userTableName} WHERE id = ? LIMIT 1`,
            [userId]
        );
        return rows.length > 0;
    }

    /**
     * 校验经验行为频次限制（兼容终身/每日）
     */
    private async checkExpActionLimit(
        userId: number,
        bizType: string
    ): Promise<{
        pass: boolean;
        usedCount: number;
        limitCount: number;
        limitType: 'lifetime' | 'daily';
    }> {
        // 1. 获取规则配置
        const config = this.expLimitConfig[bizType];
        const limitType = config?.limitType || 'daily';
        const limitCount = config?.limitCount || Infinity;

        if (limitCount === Infinity) {
            return { pass: true, usedCount: 0, limitCount, limitType };
        }

        // 2. 构造统计SQL（区分终身/每日）
        let timeWhere = '';
        if (limitType === 'daily') {
            timeWhere = 'AND DATE(created_at) = CURDATE()';
        }

        // 3. 查询已使用次数（仅统计正向经验）
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT COUNT(*) AS count 
             FROM ${this.userExpLogTableName} 
             WHERE user_id = ? 
               AND behavior = ? 
               ${timeWhere}
               AND exp_change > 0`,
            [userId, config.remark]
        );
        const usedCount = Number(rows[0].count) || 0;

        // 4. 判断是否通过校验
        const pass = usedCount < limitCount;
        return { pass, usedCount, limitCount, limitType };
    }

    /**
     * 复用连接更新经验（原有逻辑保留）
     */
    private async updateUserExpWithConn(
        userId: number,
        exp: number,
        behavior: string,
        connection: any,
        sourceId: number | null = null
    ): Promise<void> {
        // 查询当前经验
        const [profileRows] = await connection.execute(
            `SELECT level_exp FROM ${this.userProfileTableName} WHERE user_id = ? LIMIT 1`,
            [userId]
        );
        const currentExp = (profileRows as any[])[0]?.level_exp || 0;
        const newExp = Math.max(0, currentExp + exp);

        // 更新经验值
        await connection.execute(
            `UPDATE ${this.userProfileTableName}
             SET level_exp = ?, updated_at = NOW()
             WHERE user_id = ?`,
            [newExp, userId]
        );

        // 记录经验日志
        await connection.execute(
            `INSERT INTO ${this.userExpLogTableName}
             (user_id, exp_change, behavior, current_exp, source_id, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [userId, exp, behavior, newExp, sourceId]
        );
    }

    /**
     * 完善用户信息奖励经验（适配新规则）
     */
    async completeUserInfo(userId: number, infoType: string) {
        const bizTypeMap = {
            email: 'profile_email_complete',
            profile: 'profile_info_complete',
            avatar: 'profile_avatar_complete'
        };
        const bizType = bizTypeMap[infoType as keyof typeof bizTypeMap];
        if (!bizType) return { success: false, message: '不支持的资料类型' };

        return this.addExpByBizType(userId, bizType, null);
    }

    /**
     * 新增账单奖励经验（适配新规则）
     */
    async addBillExp(userId: number, billId: number) {
        return this.addExpByBizType(userId, 'bill_add', billId);
    }

    /**
     * 检查并执行等级升级（原有逻辑保留）
     */
    private async checkUserLevelUp(userId: number, currentExp: number, connection?: any): Promise<void> {
        const usePool = !connection;
        let conn = connection;
        if (usePool) conn = await pool.getConnection();

        try {
            const [profileRows] = await conn.execute(
                `SELECT level FROM ${this.userProfileTableName} WHERE user_id = ? LIMIT 1`,
                [userId]
            );
            const currentLevel = (profileRows as any[])[0]?.level || 1;

            const [nextLevelRule] = await conn.execute(
                `SELECT id, min_exp FROM ${this.userLevelRuleTableName} WHERE id > ? AND min_exp <= ? ORDER BY id ASC LIMIT 1`,
                [currentLevel, currentExp]
            );

            if (nextLevelRule.length > 0) {
                const nextLevel = (nextLevelRule as any[])[0];
                await conn.execute(
                    `UPDATE ${this.userProfileTableName} SET level = ?, updated_at = NOW() WHERE user_id = ?`,
                    [nextLevel.id, userId]
                );
                console.log(`用户${userId}升级至${nextLevel.id}级（经验${currentExp}）`);
            }
        } catch (error) {
            console.error("等级升级检查失败：", { userId, currentExp, error });
            throw error;
        } finally {
            if (usePool && conn) conn.release();
        }
    }

    /**
     * 检查并执行等级降级（原有逻辑保留）
     */
    private async checkUserLevelDown(userId: number, currentExp: number, connection: any): Promise<void> {
        try {
            const [profileRows] = await connection.execute(
                `SELECT level FROM ${this.userProfileTableName} WHERE user_id = ? LIMIT 1`,
                [userId]
            );
            const currentLevel = (profileRows as any[])[0]?.level || 1;
            if (currentLevel <= 1) return;

            const [currentLevelRule] = await connection.execute(
                `SELECT min_exp FROM ${this.userLevelRuleTableName} WHERE id = ? LIMIT 1`,
                [currentLevel]
            );
            const minExp = (currentLevelRule as any[])[0]?.min_exp || 0;

            if (currentExp < minExp) {
                const [prevLevelRule] = await connection.execute(
                    `SELECT id FROM ${this.userLevelRuleTableName} WHERE id < ? ORDER BY id DESC LIMIT 1`,
                    [currentLevel]
                );
                const prevLevel = (prevLevelRule as any[])[0]?.id || 1;
                await connection.execute(
                    `UPDATE ${this.userProfileTableName} SET level = ?, updated_at = NOW() WHERE user_id = ?`,
                    [prevLevel, userId]
                );
                console.log(`用户${userId}降级至${prevLevel}级（经验${currentExp}）`);
            }
        } catch (error) {
            console.error("等级降级检查失败：", { userId, currentExp, error });
            throw error;
        }
    }

    /**
     * 退回用户经验（原有逻辑保留）
     */
    async rollbackUserExp(userId: number, sourceId: number, behavior: string): Promise<void> {
        let connection: any = null;
        try {
            connection = await pool.getConnection();
            await connection.beginTransaction();

            const [expLogRows] = await connection.execute(
                `SELECT id, exp_change FROM ${this.userExpLogTableName}
                 WHERE user_id = ? AND source_id = ? AND exp_change > 0 ORDER BY created_at DESC LIMIT 1`,
                [userId, sourceId]
            );

            if (expLogRows.length === 0) {
                console.log(`用户${userId}来源ID${sourceId}无已发放经验，无需退回`);
                await connection.commit();
                return;
            }

            const issuedExp = (expLogRows as any[])[0].exp_change;
            const rollbackExp = -Math.abs(issuedExp);
            await this.updateUserExpWithConn(userId, rollbackExp, behavior, connection, sourceId);

            const [profileRows] = await connection.execute(
                `SELECT level_exp FROM ${this.userProfileTableName} WHERE user_id = ? LIMIT 1`,
                [userId]
            );
            const currentExp = (profileRows as any[])[0]?.level_exp || 0;
            await this.checkUserLevelDown(userId, currentExp, connection);

            await connection.commit();
            console.log(`用户${userId}退回经验${rollbackExp}（来源ID${sourceId}，行为：${behavior}）`);
        } catch (error) {
            if (connection) await connection.rollback().catch((err: any) => console.error("积分退回回滚失败：", err));
            console.error("退回用户积分失败：", { userId, sourceId, behavior, error });
            throw new Error(`退回积分失败：${(error as Error).message}`);
        } finally {
            if (connection) connection.release();
        }
    }

    /**
     * 原有updateUserExp方法（兼容旧调用）
     */
    async updateUserExp(
        userId: number,
        exp: number,
        behavior: string,
        sourceId: number | null = null
    ): Promise<void> {
        let connection: any = null;
        try {
            connection = await pool.getConnection();
            await connection.beginTransaction();
            await this.updateUserExpWithConn(userId, exp, behavior, connection, sourceId);
            await connection.commit();
        } catch (error) {
            if (connection) await connection.rollback();
            throw error;
        } finally {
            if (connection) connection.release();
        }
    }
}

export default new UserModule();