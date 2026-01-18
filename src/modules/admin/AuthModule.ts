import pool from "../../db";
import bcrypt from "bcrypt";
import {ResultSetHeader, RowDataPacket} from 'mysql2';
import {v4 as uuidv4} from "uuid"; // 核心导入语句
import type {UserDbSchema} from "../../types";
import {generateToken} from "../../utils/tokenUtils";
import * as address from 'address';
import HttpError from "../../utils/HttpError";
import UsernameGenerator from "../../tools/usernameGenerator";

class AuthModule {
    sysUserTableName = "mate_sys_user";
    sysLogTableName = "mate_sys_login_log"
    bookTableName = "mate_book";
    userProfileTableName = "mate_user_profile";
    // async findOne(
    //     username: string,
    //     selectAccount: string
    // ): Promise<UserDbSchema | null> {
    //     const [rows] = await pool.execute(
    //         `SELECT *
    //          FROM ${this.userTableName}
    //          WHERE username = ? OR  username = ? LIMIT 1`,
    //         [username, selectAccount]
    //     );
    //     // console.log(rows);
    //     const user = (rows as UserDbSchema[])[0];
    //     return user || null;
    // }
    /**
     * 创建后台管理员账号
     * @param connection 数据库连接（事务复用）
     * @param phone 手机号（作为账号）
     * @param userId 关联的前端用户ID
     */
    async createAdminAccount(connection: any, phone: string, userId: number) {
        try {
            // 1. 生成加密密码（手机号后6位）
            const plainPassword = phone.slice(-6);
            const hashedPassword = await bcrypt.hash(plainPassword, 10);

            // 2. 检查管理员账号是否已存在（避免重复创建）
            const [adminRows] = await connection.execute(
                `SELECT id
                 FROM ${this.sysUserTableName}
                 WHERE username = ? LIMIT 1`,
                [phone]
            );
            if ((adminRows as any[]).length > 0) {
                return {success: true, message: '管理员账号已存在', exists: true};
            }

            // 3. 插入后台管理员数据（基础配置）
            const [insertResult] = await connection.execute(
                `INSERT INTO ${this.sysUserTableName} (username, password, nickname, mobile, status, user_id,
                                                       creator, create_time, updater, update_time, deleted)
                 VALUES (?, ?, ?, ?, 1, ?, ?, NOW(), ?, NOW(), 0)`,
                [
                    phone, // 用户名=手机号
                    hashedPassword, // 加密密码
                    `用户${phone.slice(-4)}`, // 昵称（如用户8888）
                    phone, // 手机号
                    userId, // 关联前端用户ID
                    0, // 创建人（超级管理员ID，根据实际调整）
                    0, // 更新人
                ]
            );

            return {
                success: true,
                message: '管理员账号创建成功',
                adminId: (insertResult as any).insertId,
                initialPassword: plainPassword // 返回明文（仅日志/提示用，生产环境不返回）
            };
        } catch (error) {
            console.error('创建管理员账号失败：', error);
            throw new Error(`创建管理员账号失败：${(error as Error).message}`);
        }
    }


    /**
     * 登录方法
     * @param selectAccount 账号类型（admin-后台管理员/front-前端用户）
     * @param username 用户名（手机号/账号）
     * @param password 明文密码
     * @param captcha 是否需要校验验证码（true=需要/false=不需要）
     * @returns 登录结果（含token、用户信息）
     */
    async login(

        username: string,
        password: string,
        captcha: boolean = true
    ): Promise<{
        code: number; // 确保类型为number，避免undefined
        message: string;
        data?: {
            accessToken: string;
            userInfo: any;
            expires: number;
        };
        error?: string;
    }> {
        // 1. 基础参数校验（修复：确保code是整数）
        if ( !username || !password) {
            // 记录日志：补充login_type参数
            await this.recordLoginLog(username, 'param_error', '账号类型/用户名/密码不能为空', '', 'password');
            return {
                code: 400, // 明确整数，避免undefined
                message: '账号类型、用户名、密码不能为空',
            };
        }

        // 2. 验证码校验（修复：日志调用补充login_type）
        // if (captcha) {
        //     const captchaValid = await verifyCaptcha(username, password);
        //     if (!captchaValid) {
        //         await recordLoginLog(username, selectAccount, 'captcha_error', '验证码错误', '', 'password');
        //         return {
        //             code: 401, // 明确整数
        //             message: '验证码错误或已过期',
        //         };
        //     }
        // }


        // const tableName = selectAccount === 'admin' ? 'sys_admin_user' : 'sys_user';
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // 3. 查询用户信息
            const [userRows] = await connection.execute<RowDataPacket[]>(
                `SELECT id,
                        username,
                        password,
                        nickname,
                        mobile,
                        status,
                        DATE_FORMAT(last_login_time, '%Y-%m-%d %H:%i:%s') AS last_login_time,
                        last_login_ip
                 FROM ${this.sysUserTableName}
                 WHERE (username = ? OR mobile = ?)
                   AND deleted = 0 LIMIT 1`,
                [username, username]
            );

            if (userRows.length === 0) {
                await this.recordLoginLog(username, 'user_not_exist', '账号不存在', '', 'password');
                await connection.commit();
                return {
                    code: 404, // 明确整数
                    message: '账号不存在或已被删除',
                };
            }

            const user = userRows[0];

            // 4. 账号状态校验
            if (user.status !== 1) {
                const statusMsg = user.status === 0 ? '禁用' : '锁定';
                await this.recordLoginLog(username, 'account_forbidden', `账号已${statusMsg}`, '', 'password');
                await connection.commit();
                return {
                    code: 403, // 明确整数
                    message: `账号已${statusMsg}，请联系管理员`,
                };
            }

            // 5. 密码验证
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                await this.recordLoginLog(username, 'password_error', '密码错误', '', 'password');
                await connection.commit();
                return {
                    code: 401, // 明确整数
                    message: '密码错误，请重新输入',
                };
            }
            const loginIp = address.ip();
            // 6. 登录成功处理
            const loginTime = new Date();
            await connection.execute<ResultSetHeader>(
                `UPDATE ${this.sysUserTableName}
                 SET last_login_time = ?,
                     last_login_ip = ?,
                     login_count = login_count + 1
                 WHERE id = ?`,
                [loginTime, loginIp, user.id]
            );

            // 生成Token（示例）
            // const token = `token_${user.id}_${Date.now()}`;
            const expires = Date.now() + 24 * 60 * 60 * 1000;

            // 记录成功日志：补充login_type
            await this.recordLoginLog(username, 'success', '登录成功', loginIp, 'password');

            await connection.commit();

            // 脱敏用户信息
            // const userInfo = {
            //     id: user.id,
            //     username: user.username,
            //     nickname: user.nickname,
            //     mobile: user.mobile,
            //     role: selectAccount === 'admin' ? 'admin' : 'user',
            //     lastLoginTime: user.last_login_time,
            // };
            const userInfo = this.formatSafeUser(user);
            // return generateToken(safeUser);
            userInfo.roles= ["super"]
            userInfo.realName="掌账 Mate"
            return {
                code: 0, // 明确整数
                message: 'ok',
                data: {
                    accessToken: generateToken(userInfo),
                    ...userInfo,
                    expires,
                },
            };
        } catch (error) {
            await connection.rollback();
            console.error('登录异常：', error);
            // 记录系统错误日志：补充login_type
            await this.recordLoginLog(username, 'system_error', (error as Error).message, '', 'password');
            return {
                code: 500, // 明确整数，避免undefined
                message: '登录失败，请稍后重试',
                error: (error as Error).message,
            };
        } finally {
            connection.release();
        }
    }

// --------------- 配套辅助模块示例（需根据实际项目实现） ---------------
    /**
     * 验证码校验（示例）
     * @param username 用户名/手机号
     * @param captchaCode 验证码
     */
    async verifyCaptcha(username: string, captchaCode: string): Promise<boolean> {
        // 实际逻辑：从Redis获取该用户的验证码，对比是否一致且未过期
        // const redisKey = `captcha:${username}`;
        // const realCaptcha = await redisClient.get(redisKey);
        // return realCaptcha === captchaCode;
        return true; // 测试用，替换为真实逻辑
    }

    /**
     * 记录登录日志（修复版：补充login_type字段，适配表结构）
     * @param username 用户名
     * @param logType 日志类型（success/password_error等）
     * @param remark 备注
     * @param ip 登录IP
     * @param loginType 登录方式（默认password，补充缺失字段）
     */
    async recordLoginLog(
        username: string,
        logType: string,
        remark: string,
        ip = '',
        loginType: string = 'password'
    ): Promise<void> {
        try {
            // 1. 明确列出要插入的列（数一下：共5列）
            const columns = `username, login_type, log_type, ip, remark, create_time`;
            // 2. 明确对应的值占位符（数一下：共6个值，5个? + 1个NOW()）
            const placeholders = `?, ?, ?, ?, ?, NOW()`;

            const sql = `INSERT INTO ${this.sysLogTableName} (${columns}) VALUES (${placeholders})`;

            // 3. 传入的参数数组必须和列顺序完全一致（数一下：共5个参数）
            const params = [
                username,    // 对应 username 列
                loginType,   // 对应 login_type 列
                logType,     // 对应 log_type 列
                ip,          // 对应 ip 列
                remark       // 对应 remark 列
                // create_time 由 NOW() 自动生成，无需传参
            ];

            // 调试：打印SQL和参数，方便核对数量（上线前可删除）
            console.log('执行的SQL:', sql);
            console.log('参数数量:', params.length);
            console.log('参数内容:', params);

            const [result] = await pool.execute<ResultSetHeader>(sql, params);
            console.log('登录日志记录成功：', result.affectedRows);
        } catch (error) {
            console.error('登录日志记录失败：', error);
        }
    }


    // 格式化用户信息（隐藏敏感字段）
    formatSafeUser(user: any): any {
        // 排除密码相关字段和其他敏感信息
        const {password, ...safeData} = user;
        return safeData as any;
    }

    // 生成TOKEN
    generateToken(user: any): string {
        // 调用工具类生成 token（复用之前的 tokenUtils）
        return generateToken(user);
    }


    // 更新最后登录时间
    async updateLastLogin(id: number, openid: string): Promise<void> {
        await pool.execute(
            `UPDATE ${this.sysUserTableName}
             SET last_login_at = ?,
                 updated_at    = ?,
                 openid        = ?
             WHERE id = ?`,
            [new Date(), new Date(), openid, id]
        );
    }
}

export default new AuthModule();
