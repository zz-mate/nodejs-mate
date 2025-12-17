import pool from '../../db/index.ts';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from "uuid"; // 核心导入语句
// @ts-ignore
import { generateToken } from '../../utils/tokenUtils.ts';
class AuthModule {
    constructor() {
        this.userTableName = 'mate_user';
        this.bookTableName = 'mate_book';
    }
    /**
     * 根据手机号查询用户
     */
    async findByPhone(phone) {
        const [rows] = await pool.execute(`SELECT *
             FROM ${this.userTableName}
             WHERE phone = ? LIMIT 1`, [phone]);
        const user = rows[0];
        return user || null;
    }
    /**
     * 创建新用户（自动注册）并返回用户信息+Token
     */
    async createUser(phone) {
        // 1. 生成默认密码（手机号后六位）并加密
        const defaultPassword = phone.slice(-6);
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        // 2. 构造完全匹配表结构的默认数据
        const defaultData = {
            username: `user_${phone.slice(-4)}`, // 唯一用户名（表中 uk_username 约束）
            uuid: uuidv4(), // 36位唯一UUID（表中 uk_uuid 约束）
            phone: phone || null, // 手机号（可选，表中 uk_phone 约束）
            email: null, // email 改为可空，直接传 null 即可
            password: hashedPassword, // 加密密码（表中 NOT NULL）
            nickname: "掌账Mate",
            avatar: "",
            is_active: 1, // 状态：1正常（匹配表注释）
            role: "user", // 默认角色
            last_login_at: new Date().toISOString().slice(0, 19).replace("T", " "), // 转MySQL日期格式
            created_at: new Date().toISOString().slice(0, 19).replace("T", " "), // 可选：数据库自动生成，也可手动传
            updated_at: new Date().toISOString().slice(0, 19).replace("T", " "), // 可选：数据库自动更新
            deleted_at: null, // 软删除初始为null
            gender: 0, // 性别默认未知
            birthday: null, // 生日默认null
        };
        try {
            // 3. 执行插入SQL（字段名/数量100%匹配最新表结构）
            const [result] = await pool.execute(`INSERT INTO ${this.userTableName}
         (username, uuid, phone, email, password, nickname, avatar, gender, birthday, is_active, role, last_login_at, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
            ]);
            console.log("✅ 用户插入成功！自增ID：", result.insertId);
            const newUser = {
                ...defaultData,
                id: result.insertId, // 注意是 user_id（下划线）
            };
            const safeUser = this.formatSafeUser(newUser);
            /**
             * 新增账本：新用户默认账本
             */
            // 4. 构造完全匹配表结构的默认数据
            const defaultBookData = {
                uuid: uuidv4(), // 36位唯一UUID（表中 uk_uuid 约束）
                user_id: result.insertId, // 手机号（可选，表中 uk_phone 约束）
                name: "日常账本", // email 改为可空，直接传 null 即可
                type: 1, // 加密密码（表中 NOT NULL）
                currency: "CNY",
                description: "",
                is_default: 1, // 状态：1正常（匹配表注释）
                is_active: 1, // 状态 1 正常
                created_at: new Date().toISOString().slice(0, 19).replace("T", " "), // 可选：数据库自动生成，也可手动传
                updated_at: new Date().toISOString().slice(0, 19).replace("T", " "), // 可选：数据库自动更新
                deleted_at: null, // 软删除初始为null
            };
            await pool.execute(`INSERT INTO ${this.bookTableName}
         ( uuid, user_id, name, type, currency, description, is_default, is_active,  created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                defaultBookData.uuid,
                defaultBookData.user_id,
                defaultBookData.name,
                defaultBookData.type,
                defaultBookData.currency,
                defaultBookData.description,
                defaultBookData.is_default,
                defaultBookData.is_active,
                defaultBookData.created_at,
                defaultBookData.updated_at,
                defaultBookData.deleted_at,
            ]);
            return generateToken(safeUser);
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
    /**
     * 格式化用户信息（隐藏敏感字段）
     */
    formatSafeUser(user) {
        // 排除密码相关字段和其他敏感信息
        const { password, ...safeData } = user;
        return safeData;
    }
    /**
     * 生成TOKEN
     * @param user
     */
    generateToken(user) {
        // 调用工具类生成 token（复用之前的 tokenUtils）
        return generateToken(user);
    }
    /**
     * 更新最后登录时间
     */
    async updateLastLogin(id) {
        await pool.execute(`UPDATE ${this.userTableName} SET last_login_at = ?, updated_at = ? WHERE id = ?`, [new Date(), new Date(), id]);
    }
}
export default new AuthModule();
