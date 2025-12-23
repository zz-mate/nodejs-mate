import pool from '../../db';
import type {UserDbSchema,UserQRContent, QRCodeConfig, UserProfile} from "../../types";
import {maskPhoneNumber} from "../../utils/tools";
import { generateUserQRCode } from '../../utils/qrcode';

class UserModule {
    // 表名定义
    userTableName = 'mate_user';
    userProfileTableName = 'mate_user_profile';
    billTableName = 'mate_bill';
    userLevelRuleTableName = 'mate_user_level_rule';
    userExpLogTableName = 'mate_user_exp_log'; // 经验日志表（新增source_id字段）
     userPointsTableName = 'mate_user_points'; // 用户总积分/可用积分表
    /**
     * 基础查询：通过ID查找用户（非事务 → pool.execute）
     * @param user_id 用户ID
     * @returns 用户基础信息
     */
    async findById(user_id: number): Promise<UserDbSchema | null> {
        const [rows] = await pool.execute(
            `SELECT id
             FROM ${this.userTableName}
             WHERE id = ? LIMIT 1`,
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
        // 1. 获取用户信息（非事务 → pool.execute）
        const [rows] = await pool.execute(
            `SELECT id,avatar,nickname,default_book_id
             FROM ${this.userTableName}
             WHERE id = ? LIMIT 1`,
            [userId]
        );
        const user = (rows as UserDbSchema[])[0];
        const bookId = user?.default_book_id || 0;
        // 2. 生成二维码
        return generateUserQRCode(userId, bookId, {}, config);
    };
    calculateLevelProgressPercent(userExp: number, currentLevelMinExp: number) {
        // 处理当前等级最低经验为0的特殊情况（避免除以0）
        if (currentLevelMinExp <= 0) {
            return userExp > 0 ? 100.0 : 0.0;
        }

        // 核心计算：用户经验 / 当前等级最低经验 * 100%
        let percent = (userExp / currentLevelMinExp) * 100;

        // 边界限制：百分比最多100%，最少0%
        percent = Math.max(0, Math.min(100, percent));

        // 保留1位小数并转为数字
        return Number(percent.toFixed(1));
    }

    /**
     * 核心方法：获取用户完整信息（含等级、统计、自动更新）
     * 事务内用connection.execute，非事务前置/后置查询用pool.execute
     * @returns 包含扩展信息的用户数据
     * @param userId
     */
    async info(userId: number): Promise<(UserDbSchema & {
        gender_text: string;
        pointsInfo:any,
        levelInfo:any,
        // level?: number;
        // level_exp?: number;
        // level_name?: string;
        // min_exp?: number;
        // privileges?: string;
        // icon: string;
        total_used_days: number;
        continuous_used_days: number;
        total_bill_count: number;
    }) | null> {
        let connection: any = null;
        try {
            // ===== 非事务前置查询：用户基础信息（pool.execute）=====
            const [userRows] = await pool.execute(
                `SELECT id,
                        uuid,
                        username,
                        email,
                        phone,
                        nickname,
                        avatar,
                        gender,
                        birthday,
                        default_book_id,
                        is_active,
                        created_at,
                        updated_at
                 FROM ${this.userTableName}
                 WHERE id = ?
                   AND is_active = 1
                   AND deleted_at IS NULL LIMIT 1`,
                [userId]
            );
            const user = (userRows as UserDbSchema[])[0];
            if (!user) return null; // 无用户直接返回，无需开启事务

            // ===== 非事务查询：记账笔数（pool.execute）=====
            const [billCountRows] = await pool.execute(
                `SELECT COUNT(*) as total_count
                 FROM ${this.billTableName}
                 WHERE user_id = ?
                   AND is_deleted = 0`,
                [userId]
            );
            const totalBillCount = (billCountRows as any[])[0].total_count || 0;

            // ===== 计算核心统计值（非数据库操作）=====
            const registerTime = user.created_at;
            const currentTime = new Date();
            // @ts-ignore
            const totalUsedDays = Math.floor((currentTime.getTime() - new Date(registerTime).getTime()) / (1000 * 60 * 60 * 24)) + 1;

            // ===== 开启事务：所有更新操作绑定单个连接 =====
            connection = await pool.getConnection();
            await connection.beginTransaction();

            // ===== 事务内：查询用户信息表 =====
            const [profileRows] = await connection.execute(
                `SELECT id, level, level_exp, last_login_time, continuous_used_days
                 FROM ${this.userProfileTableName}
                 WHERE user_id = ? LIMIT 1`,
                [userId]
            );
            const profileExist = (profileRows as any[]).length > 0;
            let userLevel = 1;
            let userLevelExp = 0;
            let continuousUsedDays = 1;

            if (profileExist) {
                // 有数据：更新统计信息
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

                // 执行更新（事务内 → connection.execute）
                await connection.execute(
                    `UPDATE ${this.userProfileTableName}
           SET last_login_time      = NOW(),
               total_used_days      = ?,
               continuous_used_days = ?,
               total_bill_count     = ?,
               updated_at           = NOW()
           WHERE user_id = ?`,
                    [totalUsedDays, continuousUsedDays, totalBillCount, userId]
                );
            } else {
                // 无数据：插入初始统计数据
                await connection.execute(
                    `INSERT INTO ${this.userProfileTableName}
           (user_id, level, level_exp, register_time, last_login_time, total_used_days, continuous_used_days,
            total_bill_count, month_bill_count, total_income, total_expense, total_book_count,
            favorite_category_ids, is_vip, vip_expire_time, remark, created_at, updated_at, is_deleted)
           VALUES (?, 1, 0, ?, NOW(), ?, 1, ?, 0, 0.00, 0.00, 1, '', 0, null, '', NOW(), NOW(), 0)`,
                    [userId, registerTime, totalUsedDays, totalBillCount]
                );
            }

            // 连续登录奖励（事务内 → 复用connection）
            if (continuousUsedDays === 7) {
                await this.updateUserExpWithConn(userId, 50, "连续登录7天奖励", connection, null);
            }
            if (continuousUsedDays === 30) {
                await this.updateUserExpWithConn(userId, 200, "连续登录30天奖励", connection, null);
            }

            // 查询奖励后经验（事务内）
            const [updatedProfile] = await connection.execute(
                `SELECT level, level_exp
         FROM ${this.userProfileTableName}
         WHERE user_id = ? LIMIT 1`,
                [userId]
            );
            userLevel = (updatedProfile as any[])[0]?.level || 1;
            userLevelExp = (updatedProfile as any[])[0]?.level_exp || 0;

            // 检查等级升级（事务内）
            await this.checkUserLevelUp(userId, userLevelExp, connection);

            // 查询升级后等级（事务内）
            const [finalProfile] = await connection.execute(
                `SELECT level, level_exp
                 FROM ${this.userProfileTableName}
                 WHERE user_id = ? LIMIT 1`,
                [userId]
            );
            userLevel = (finalProfile as any[])[0]?.level || 1;
            userLevelExp = (finalProfile as any[])[0]?.level_exp || 0;

            // 提交事务
            await connection.commit();

            // ===== 非事务后置查询：等级规则（pool.execute）=====
            const [levelRuleRows] = await pool.execute(
                `SELECT level_name, min_exp, privileges, icon
                 FROM ${this.userLevelRuleTableName}
                 WHERE id = ? LIMIT 1`,
                [userLevel]
            );
            const levelInfo = (levelRuleRows as any[])[0] || {
                level_name: '新手',
                min_exp: 100,
                privileges: '基础记账、1个账本',
                icon: '',
                userLevelExp:0,
                userLevel:0
            };
            const [pointRows] = await pool.execute(
                `SELECT *
                 FROM ${this.userPointsTableName}
                 WHERE user_id = ? LIMIT 1`,
                [userId]
            );
            const pointsInfo = (pointRows as any[])[0]
            // 性别映射

            const genderText = {
                1: '男',
                2: '女'
                // @ts-ignore
            }[user.gender] || '未知';

            // 组装返回数据
            return {
                ...user,
                phone: maskPhoneNumber(typeof user.phone === "string" ? user.phone : ''),
                gender_text: genderText,
                pointsInfo,
                levelInfo:{...levelInfo,user_level_exp:userLevelExp,user_level:userLevel,LevelProgress:this.calculateLevelProgressPercent(userLevelExp,levelInfo.min_exp)},
                // level: userLevel,
                // level_exp: userLevelExp,
                // level_name: levelRule.level_name,
                // min_exp: levelRule.min_exp,
                // privileges: levelRule.privileges,
                // icon: levelRule.icon,
                total_used_days: totalUsedDays,
                continuous_used_days: continuousUsedDays,
                total_bill_count: totalBillCount
            };

        } catch (error) {
            // 异常回滚
            if (connection) {
                await connection.rollback().catch((err: any) => console.error("事务回滚失败：", err));
            }
            console.error("获取/更新用户信息失败：", { userId, error: (error as Error).message });
            throw new Error(`获取用户信息失败：${(error as Error).message}`);
        } finally {
            // 释放连接
            if (connection) {
                connection.release();
            }
        }
    }

    /**
     * 扩展方法：复用连接更新经验（事务内 → 必须用connection.execute）
     * @param userId 用户ID
     * @param exp 经验值（正数加，负数减）
     * @param behavior 行为描述
     * @param connection 复用的数据库连接
     * @param sourceId 来源ID（账单ID/分类ID等）
     */
    private async updateUserExpWithConn(
        userId: number,
        exp: number,
        behavior: string,
        connection: any,
        sourceId: number | null = null
    ): Promise<void> {
        try {
            // 防刷校验（事务内 → connection.execute）
            // 退回积分时跳过防刷限制
            const canAddExp = exp > 0
                ? await this.checkDailyExpLimit(userId, behavior, exp, connection)
                : true;

            if (!canAddExp) {
                console.log(`用户${userId}今日${behavior}经验已达上限`);
                return;
            }

            // 查询当前经验（事务内）
            const [profileRows] = await connection.execute(
                `SELECT level_exp
                 FROM ${this.userProfileTableName}
                 WHERE user_id = ? LIMIT 1`,
                [userId]
            );
            const currentExp = (profileRows as any[])[0]?.level_exp || 0;
            const newExp = Math.max(0, currentExp + exp); // 经验不能为负

            // 更新经验值（事务内）
            await connection.execute(
                `UPDATE ${this.userProfileTableName}
                 SET level_exp = ?,
                     updated_at = NOW()
                 WHERE user_id = ?`,
                [newExp, userId]
            );

            // 记录经验日志（事务内，新增source_id字段）
            await connection.execute(
                `INSERT INTO ${this.userExpLogTableName}
                     (user_id, exp_change, behavior, current_exp, source_id, created_at)
                 VALUES (?, ?, ?, ?, ?, NOW())`,
                [userId, exp, behavior, newExp, sourceId]
            );

        } catch (error) {
            console.error("复用连接更新经验失败：", { userId, exp, behavior, sourceId, error });
            throw error; // 抛出异常让外层事务回滚
        }
    }

    /**
     * 扩展方法：增减用户等级经验（独立事务 → 需connection.execute）
     * @param userId 用户ID
     * @param exp 经验值（正数加，负数减）
     * @param behavior 行为描述
     * @param sourceId 来源ID（账单ID/分类ID等）
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

            // 防刷校验（事务内），退回积分时跳过
            const canAddExp = exp > 0
                ? await this.checkDailyExpLimit(userId, behavior, exp, connection)
                : true;

            if (!canAddExp) {
                console.log(`用户${userId}今日${behavior}经验已达上限`);
                await connection.commit(); // 无更新，提交空事务
                return;
            }

            // 查询当前经验（事务内）
            const [profileRows] = await connection.execute(
                `SELECT level_exp
                 FROM ${this.userProfileTableName}
                 WHERE user_id = ? LIMIT 1`,
                [userId]
            );
            const currentExp = (profileRows as any[])[0]?.level_exp || 0;
            const newExp = Math.max(0, currentExp + exp); // 经验不能为负

            // 更新经验值（事务内）
            await connection.execute(
                `UPDATE ${this.userProfileTableName}
                 SET level_exp = ?,
                     updated_at = NOW()
                 WHERE user_id = ?`,
                [newExp, userId]
            );

            // 自动升级（事务内）
            await this.checkUserLevelUp(userId, newExp, connection);

            // 记录经验日志（事务内，新增source_id字段）
            await connection.execute(
                `INSERT INTO ${this.userExpLogTableName}
                     (user_id, exp_change, behavior, current_exp, source_id, created_at)
                 VALUES (?, ?, ?, ?, ?, NOW())`,
                [userId, exp, behavior, newExp, sourceId]
            );

            await connection.commit();
            console.log(`[经验新增成功] 用户${userId} 新增${exp}经验`);
        } catch (error) {
            if (connection) await connection.rollback().catch((err: any) => console.error("经验更新回滚失败：", err));
            console.error("更新经验失败：", { userId, exp, behavior, sourceId, error });
            throw new Error(`更新经验失败：${(error as Error).message}`);
        } finally {
            if (connection) connection.release();
        }
    }

    /**
     * 新增方法：退回用户积分（删除账单/分类等操作）
     * @param userId 用户ID
     * @param sourceId 来源ID（账单ID/分类ID等）
     * @param behavior 行为描述（如：删除账单、删除自定义分类）
     */
    async rollbackUserExp(
        userId: number,
        sourceId: number,
        behavior: string
    ): Promise<void> {
        let connection: any = null;
        try {
            connection = await pool.getConnection();
            await connection.beginTransaction();

            // 1. 查询该来源ID对应的已发放经验
            const [expLogRows] = await connection.execute(
                `SELECT id, exp_change 
                 FROM ${this.userExpLogTableName}
                 WHERE user_id = ? 
                   AND source_id = ? 
                   AND exp_change > 0
                 ORDER BY created_at DESC LIMIT 1`,
                [userId, sourceId]
            );

            if (expLogRows.length === 0) {
                console.log(`用户${userId}来源ID${sourceId}无已发放经验，无需退回`);
                await connection.commit();
                return;
            }

            // 2. 计算需要退回的经验值（负数）
            const issuedExp = (expLogRows as any[])[0].exp_change;
            const rollbackExp = -Math.abs(issuedExp); // 转为负数

            // 3. 更新用户经验（退回）
            await this.updateUserExpWithConn(
                userId,
                rollbackExp,
                behavior,
                connection,
                sourceId
            );

            // 4. 检查等级降级（如果需要）
            const [profileRows] = await connection.execute(
                `SELECT level_exp 
                 FROM ${this.userProfileTableName}
                 WHERE user_id = ? LIMIT 1`,
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
     * 新增内部方法：检查并执行等级降级（经验不足时）
     * @param userId 用户ID
     * @param currentExp 当前经验值
     * @param connection 复用数据库连接
     */
    private async checkUserLevelDown(
        userId: number,
        currentExp: number,
        connection: any
    ): Promise<void> {
        try {
            // 查询当前等级
            const [profileRows] = await connection.execute(
                `SELECT level
                 FROM ${this.userProfileTableName}
                 WHERE user_id = ? LIMIT 1`,
                [userId]
            );
            const currentLevel = (profileRows as any[])[0]?.level || 1;

            // 如果是1级，无需降级
            if (currentLevel <= 1) return;

            // 查询当前等级的最低经验要求
            const [currentLevelRule] = await connection.execute(
                `SELECT min_exp 
                 FROM ${this.userLevelRuleTableName}
                 WHERE id = ? LIMIT 1`,
                [currentLevel]
            );
            const minExp = (currentLevelRule as any[])[0]?.min_exp || 0;

            // 经验不足当前等级要求，降级到上一级
            if (currentExp < minExp) {
                const [prevLevelRule] = await connection.execute(
                    `SELECT id 
                     FROM ${this.userLevelRuleTableName}
                     WHERE id < ? 
                     ORDER BY id DESC LIMIT 1`,
                    [currentLevel]
                );
                const prevLevel = (prevLevelRule as any[])[0]?.id || 1;

                await connection.execute(
                    `UPDATE ${this.userProfileTableName}
                     SET level = ?,
                         updated_at = NOW()
                     WHERE user_id = ?`,
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
     * 内部方法：检查并执行等级升级
     * @param userId 用户ID
     * @param currentExp 当前经验值
     * @param connection 复用数据库连接（有则用，无则用pool.execute）
     */
    private async checkUserLevelUp(userId: number, currentExp: number, connection?: any): Promise<void> {
        // 有复用连接则用connection.execute，无则用pool.execute
        const usePool = !connection;
        let conn = connection;
        if (usePool) conn = await pool.getConnection();

        try {
            // 查询当前等级（复用连接/pool）
            const [profileRows] = await conn.execute(
                `SELECT level
                 FROM ${this.userProfileTableName}
                 WHERE user_id = ? LIMIT 1`,
                [userId]
            );
            const currentLevel = (profileRows as any[])[0]?.level || 1;

            // 查询下一级升级规则（复用连接/pool）
            const [nextLevelRule] = await conn.execute(
                `SELECT id, min_exp
                 FROM ${this.userLevelRuleTableName}
                 WHERE id > ?
                   AND min_exp <= ?
                 ORDER BY id ASC LIMIT 1`,
                [currentLevel, currentExp]
            );

            // 满足升级条件则更新等级
            if (nextLevelRule.length > 0) {
                const nextLevel = (nextLevelRule as any[])[0];
                await conn.execute(
                    `UPDATE ${this.userProfileTableName}
                     SET level = ?,
                         updated_at = NOW()
                     WHERE user_id = ?`,
                    [nextLevel.id, userId]
                );
                console.log(`用户${userId}升级至${nextLevel.id}级（经验${currentExp}）`);
            }
        } catch (error) {
            console.error("等级升级检查失败：", { userId, currentExp, error });
            throw error;
        } finally {
            // 仅当使用pool.getConnection()时释放连接
            if (usePool && conn) conn.release();
        }
    }

    /**
     * 内部方法：校验每日经验上限（防刷）→ 事务内必须用connection.execute
     * @param userId 用户ID
     * @param behavior 行为类型
     * @param exp 本次经验值
     * @param connection 数据库连接
     */
    private async checkDailyExpLimit(
        userId: number,
        behavior: string,
        exp: number,
        connection: any
    ): Promise<boolean> {
        // 每日经验上限配置
        const limitMap: Record<string, number> = {
            "新增账单": 1,
            "连续登录": 10,
            "使用自定义分类": 1,
            "导出账单数据": 20,
            "连续登录7天奖励": 10,
            "连续登录30天奖励": 50,
            "完善邮箱信息": Infinity,
            "完善头像信息": Infinity,
            "创建多账本": 1,
            "删除账单": Infinity, // 退回积分不限制
            "删除自定义分类": Infinity // 退回积分不限制
        };
        const dailyLimit = limitMap[behavior] ?? Infinity;

        // 无上限直接通过
        if (dailyLimit === Infinity) return true;

        // 查询今日已获取经验（事务内 → connection.execute）
        const today = new Date().toISOString().split('T')[0]; // 统一为 YYYY-MM-DD
        const [expLog] = await connection.execute(
            `SELECT IFNULL(SUM(exp_change), 0) as total_exp
       FROM ${this.userExpLogTableName}
       WHERE user_id = ?
         AND behavior = ?
         AND DATE_FORMAT(created_at, '%Y-%m-%d') = ?
         AND exp_change > 0`, // 只统计正向经验
            [userId, behavior, today]
        );
        const totalTodayExp = Number((expLog as any[])[0].total_exp) || 0;

        console.log(`经验：防刷校验：用户${userId} 行为${behavior} 本次+${exp} 今日累计${totalTodayExp} 上限${dailyLimit}`);
        return (totalTodayExp + exp) <= dailyLimit;
    }

    /**
     * 完善用户信息奖励积分
     * @param userId 用户ID
     * @param infoType 完善类型：email/profile/avatar
     */
    async completeUserInfo(userId: number, infoType: string) {
        const expMap = {
            email: 20,
            profile: 10, // 生日/性别
            avatar: 15
        };
        const exp = expMap[infoType as keyof typeof expMap] || 0;
        if (exp <= 0) return;

        await this.updateUserExp(
            userId,
            exp,
            `完善${infoType}信息`,
            null // 完善信息无source_id，传null
        );
    }
}

export default new UserModule();