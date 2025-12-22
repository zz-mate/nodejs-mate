import pool from '../../db';
import bcrypt from 'bcrypt';
import {v4 as uuidv4} from "uuid"; // 核心导入语句
import type {UserDbSchema} from "../../types";
import {generateToken} from '../../utils/tokenUtils';
import HttpError from "../../utils/HttpError";
import UsernameGenerator from '../../tools/usernameGenerator';
class AuthModule {
    userTableName = 'mate_user';
    bookTableName = 'mate_book';
    userProfileTableName = 'mate_user_profile';

    // 根据手机号查询用户
    async findByPhone(phone: string): Promise<UserDbSchema | null> {
        const [rows] = await pool.execute(
            `SELECT *
             FROM ${this.userTableName}
             WHERE phone = ? LIMIT 1`,
            [phone]
        );
        const user = (rows as UserDbSchema[])[0];
        return user || null;
    }

    /**
     * 创建新用户（修复事务连接问题）
     */
    async createUser(phone: string): Promise<string> {
        // 前置校验
        if (!phone || phone.length !== 11) {
            throw new HttpError("手机号格式错误", 400);
        }

        const defaultPassword = phone.slice(-6);
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        const defaultData = {
            username: phone,
            uuid: uuidv4(),
            phone: phone,
            email: null,
            password: hashedPassword,
            nickname: UsernameGenerator.finance(),
            avatar: "",
            is_active: 1,
            role: "user",
            last_login_at: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
            gender: 0,
            birthday: null,
        };

        let connection: any = null; // 声明连接变量
        try {
            // ===== 1. 从连接池获取单个连接 =====
            connection = await pool.getConnection();
            // ===== 2. 开启事务（使用连接对象执行）=====
            await connection.beginTransaction();

            // ===== 3. 校验手机号是否已存在 =====
            const [existUser] = await connection.execute(
                `SELECT id FROM ${this.userTableName} WHERE phone = ? LIMIT 1`,
                [phone]
            );
            if ((existUser as any[]).length > 0) {
                throw new HttpError("手机号已存在，无法重复注册", 409);
            }

            // ===== 4. 插入用户表（使用connection.execute而非pool.execute）=====
            const [result] = await connection.execute(
                `INSERT INTO ${this.userTableName}
             (username, uuid, phone, email, password, nickname, avatar, gender, birthday, is_active, role,
              last_login_at, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    defaultData.username,
                    defaultData.uuid,
                    defaultData.phone,
                    defaultData.email,
                    defaultData.password,
                    defaultData.nickname,
                    defaultData.avatar,
                    defaultData.gender,
                    defaultData.birthday,
                    defaultData.is_active,
                    defaultData.role,
                    defaultData.last_login_at,
                    defaultData.created_at,
                    defaultData.updated_at,
                    defaultData.deleted_at,
                ]
            );
            const userId = (result as any).insertId;

            // ===== 5. 插入默认账本 =====
            const defaultBookData = {
                uuid: uuidv4(),
                user_id: userId,
                name: "日常账本",
                book_category_id: 1,
                type: 1,
                currency: "CNY",
                description: "",
                is_default: 1,
                is_active: 1,
                created_at: new Date(),
                updated_at: new Date(),
                deleted_at: null,
            };
            const [bookResult] = await connection.execute(
                `INSERT INTO ${this.bookTableName}
             (uuid, user_id, name, book_category_id, type, currency, description, is_default, is_active, created_at, updated_at,
              deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    defaultBookData.uuid,
                    defaultBookData.user_id,
                    defaultBookData.name,
                    defaultBookData.book_category_id,
                    defaultBookData.type,
                    defaultBookData.currency,
                    defaultBookData.description,
                    defaultBookData.is_default,
                    defaultBookData.is_active,
                    defaultBookData.created_at,
                    defaultBookData.updated_at,
                    defaultBookData.deleted_at,
                ]
            );
            const bookId = (bookResult as any).insertId;

            // ===== 6. 更新用户默认账本ID =====
            await connection.execute(
                `UPDATE ${this.userTableName} SET default_book_id = ? WHERE id = ?`,
                [bookId, userId]
            );

            // ===== 7. 插入用户信息表 =====
            const defaultProfileData = {
                user_id: userId,
                level: 1,
                level_exp: 0,
                register_time: new Date(),
                last_login_time: new Date(),
                total_used_days: 0,
                continuous_used_days: 0,
                total_bill_count: 0,
                month_bill_count: 0,
                total_income: 0.00,
                total_expense: 0.00,
                total_book_count: 1,
                favorite_category_ids: "",
                is_vip: 0,
                vip_expire_time: null,
                remark: "",
                created_at: new Date(),
                updated_at: new Date(),
                is_deleted: 0,
            };
            await connection.execute(
                `INSERT INTO ${this.userProfileTableName}
             (user_id, level, level_exp, register_time, last_login_time, total_used_days, continuous_used_days,
              total_bill_count, month_bill_count, total_income, total_expense, total_book_count,
              favorite_category_ids, is_vip, vip_expire_time, remark, created_at, updated_at, is_deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    defaultProfileData.user_id,
                    defaultProfileData.level,
                    defaultProfileData.level_exp,
                    defaultProfileData.register_time,
                    defaultProfileData.last_login_time,
                    defaultProfileData.total_used_days,
                    defaultProfileData.continuous_used_days,
                    defaultProfileData.total_bill_count,
                    defaultProfileData.month_bill_count,
                    defaultProfileData.total_income,
                    defaultProfileData.total_expense,
                    defaultProfileData.total_book_count,
                    defaultProfileData.favorite_category_ids,
                    defaultProfileData.is_vip,
                    defaultProfileData.vip_expire_time,
                    defaultProfileData.remark,
                    defaultProfileData.created_at,
                    defaultProfileData.updated_at,
                    defaultProfileData.is_deleted,
                ]
            );

            // ===== 8. 提交事务 =====
            await connection.commit();

            // ===== 9. 生成Token返回 =====
            const newUser: any = {
                ...defaultData,
                id: userId,
                default_book_id: bookId,
            };
            const safeUser = this.formatSafeUser(newUser);
            return generateToken(safeUser);

        } catch (error) {
            // ===== 事务回滚（仅当连接存在时）=====
            if (connection) {
                await connection.rollback().catch((err: any) => console.error("事务回滚失败：", err));
            }

            // ===== 异常处理 =====
            const err = error as Error & { code: string };
            console.error("创建用户失败：", {
                code: err.code,
                message: err.message,
                stack: err.stack,
                phone,
            });

            if (err.code === "ER_DUP_ENTRY") {
                throw new HttpError("手机号/用户名已存在", 409);
            } else if (err.code === "ER_NO_REFERENCED_ROW_2") {
                throw new HttpError("账本分类ID不存在", 400);
            } else if (error instanceof HttpError) {
                throw error;
            } else {
                throw new HttpError("用户创建失败，请稍后重试", 500);
            }

        } finally {
            // ===== 释放连接（关键！避免连接池耗尽）=====
            if (connection) {
                connection.release();
            }
        }
    }

    // 格式化用户信息（隐藏敏感字段）
    formatSafeUser(user: UserDbSchema): UserDbSchema {
        // 排除密码相关字段和其他敏感信息
        const {password, ...safeData} = user;
        return safeData as UserDbSchema;
    }

    // 生成TOKEN
    generateToken(user: UserDbSchema): string {
        // 调用工具类生成 token（复用之前的 tokenUtils）
        return generateToken(user);
    }

    // 更新最后登录时间
    async updateLastLogin(id: number): Promise<void> {
        await pool.execute(
            `UPDATE ${this.userTableName}
             SET last_login_at = ?,
                 updated_at = ?
             WHERE id = ?`,
            [new Date(), new Date(), id]
        );
    }

}

export default new AuthModule();