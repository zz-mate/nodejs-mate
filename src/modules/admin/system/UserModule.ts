import pool from "../../../db";
import {maskPhoneNumber} from '../../../utils/tools'
import authModule from "../AuthModule";

// 1. 定义用户数据类型（匹配实际返回字段）
interface User {
    id: number;
    uuid: string;
    openid: string;
    username: string;
    email: string | null;
    phone: string | null;
    nickname: string;
    avatar: string | null;
    gender: number;
    birthday: string | null;
    default_book_id: number | null;
    is_active: number;
    role: string;
    last_login_at: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

// 2. 分页数据核心结构（嵌套在 PageResult 的 data 中）
interface UserPageData {
    items: User[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

// 3. 你指定的最终返回接口（包含 code/message/data）
interface PageResult<T> {
    code: number; // 状态码（200成功，500失败）
    message: string; // 提示信息
    data: T; // 数据体（泛型，适配不同数据结构）
}

class UserModule {
    private readonly userTableName = "mate_user";

    /**
     * 分页查询用户列表（返回符合 PageResult 规范的结果）
     * @param page 页码
     * @param pageSize 每页条数
     * @param condition 筛选条件（可选）
     * @returns 符合规范的分页结果
     */
    async findAll(
        page: number,
        pageSize: number,
        condition: {
            username?: string;
            phone?: string;
            nickname?: string;
            is_active?: number;
            role?: string;
        } = {}
    ): Promise<PageResult<UserPageData>> {
        // 参数校验
        const validPage = Math.max(Number(page) || 1, 1);
        const validPageSize = Math.max(Number(pageSize) || 10, 1);
        const offset = (validPage - 1) * validPageSize;

        // 构建查询条件
        let whereSql = " WHERE deleted_at IS NULL ";
        const params: any[] = [];

        if (condition.username) {
            whereSql += " AND username LIKE ?";
            params.push(`%${condition.username}%`);
        }
        if (condition.phone) {
            whereSql += " AND phone LIKE ?";
            params.push(`%${condition.phone}%`);
        }
        if (condition.nickname) {
            whereSql += " AND nickname LIKE ?";
            params.push(`%${condition.nickname}%`);
        }
        if (condition.is_active !== undefined) {
            whereSql += " AND is_active = ?";
            params.push(condition.is_active);
        }
        if (condition.role) {
            whereSql += " AND role = ?";
            params.push(condition.role);
        }

        let connection;
        try {
            connection = await pool.getConnection();

            // 查询总记录数
            const [totalResult] = await connection.execute(
                `SELECT COUNT(*) AS total
                 FROM ${this.userTableName} ${whereSql}`,
                params
            );
            const total = (totalResult as any[])[0].total;

            // 分页查询用户列表
            const [listResult] = await connection.execute(
                `SELECT id,
                        uuid,
                        openid,
                        username,
                        email,
                        phone,
                        nickname,
                        avatar,
                        gender,
                        birthday,
                        default_book_id,
                        is_active,
                        role,
                        DATE_FORMAT(last_login_at, '%Y-%m-%d %H:%i:%s') AS lastLoginTime,
                        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createTime,
                        DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updateTime,
                        DATE_FORMAT(deleted_at, '%Y-%m-%d %H:%i:%s') AS deleteTime
                 FROM ${this.userTableName} ${whereSql}
                 ORDER BY created_at DESC LIMIT ?, ?`,
                [...params, String(offset), String(validPageSize)]
            );
            const maskedList = (listResult as User[]).map(user => ({
                ...user,
                phone:user.phone? maskPhoneNumber(String(user.phone)):'未绑定' // 脱敏手机号
            }));
            // 组装分页数据体
            const pageData: UserPageData = {
                items: maskedList,
                total,
                page: validPage,
                pageSize: validPageSize,
                totalPages: Math.ceil(total / validPageSize),
            };

            // 返回符合 PageResult 规范的成功结果
            return {
                code: 0,
                message: "查询用户列表成功",
                data: pageData,
            };
        } catch (e) {
            console.error("查询用户列表失败：", e);
            // 返回符合规范的失败结果
            return {
                code: 500,
                message: `查询用户列表失败：${(e as Error).message}`,
                data: {
                    items: [],
                    total: 0,
                    page: validPage,
                    pageSize: validPageSize,
                    totalPages: 0,
                },
            };
        } finally {
            if (connection) connection.release();
        }
    }

    /**
     * 根据ID查询单个用户（扩展：同样适配 PageResult 规范）
     * @param id 用户ID
     * @returns 符合规范的结果
     */
    async findById(id: number): Promise<PageResult<User | null>> {
        let connection;
        try {
            connection = await pool.getConnection();
            const [result] = await connection.execute(
                `SELECT id,
                        uuid,
                        openid,
                        username,
                        email,
                        phone,
                        nickname,
                        avatar,
                        gender,
                        birthday,
                        default_book_id,
                        is_active,
                        role,
                        last_login_at,
                        created_at,
                        updated_at,
                        deleted_at
                 FROM ${this.userTableName}
                 WHERE id = ?
                   AND deleted_at IS NULL`,
                [id]
            );
            const user = (result as User[]).length > 0 ? (result as User[])[0] : null;

            return {
                code: 200,
                message: user ? "查询用户成功" : "未找到该用户",
                data: user,
            };
        } catch (e) {
            console.error(`查询ID=${id}的用户失败：`, e);
            return {
                code: 500,
                message: `查询用户失败：${(e as Error).message}`,
                data: null,
            };
        } finally {
            if (connection) connection.release();
        }
    }
}

export default new UserModule();