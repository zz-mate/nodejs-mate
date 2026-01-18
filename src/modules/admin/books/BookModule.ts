import pool from "../../../db";

// 定义账本数据结构化类型
interface BookDetail {
    bookId: number; // 账本ID
    uuid: string;
    name: string; // 账本名称
    icon: string;
    bookCategoryId: number; // 账本分类ID
    bookCategoryName: string; // 账本分类名称
    userId: number; // 创建者/所属用户ID
    userName: string; // 创建者昵称
    isActive: number; // 是否启用（1-启用，0-停用）
    isDefault: number;
    currency: string; // 默认币种（如CNY/USD）
    description: string | null; // 账本描述
    sort_order: number; // 排序权重
    createTime: string;
    updateTime: string;
}

// 分页结果类型（与之前模块统一格式，降低前端适配成本）
interface PageResult {
    code: number;
    message: string;
    data: {
        items: BookDetail[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
}

class BookModule {
    private readonly userTableName = "mate_user";
    private readonly bookTableName = "mate_book";
    private readonly bookCategoryTableName = "mate_book_category";

    /**
     * 分页查询账本列表（支持按账本分类/名称/状态/用户筛选）
     * @param page 页码
     * @param pageSize 每页条数
     * @param bookCategoryId 账本分类ID
     * @param name 账本名称（模糊搜索）
     * @param isActive 账本状态（1-启用，0-停用）
     * @param userId 所属用户ID
     * @returns 标准化分页结果
     */
    async findAll(
        page: number,
        pageSize: number,
        bookCategoryId?: number,
        name?: string,
        isActive: number = 1, // 默认查询启用的账本
        userId?: number
    ): Promise<PageResult> {
        // 1. 参数校验与格式化（防非法参数）
        const validPage = Math.max(Number(page) || 1, 1);
        const validPageSize = Math.max(Math.min(Number(pageSize) || 10, 50), 1); // 限制最大50条
        const offset = Math.max((validPage - 1) * validPageSize, 0);
        const validIsActive = [0, 1].includes(isActive) ? isActive : 1; // 仅允许0/1，默认1

        // 2. 构建查询条件（防SQL注入，参数化传递）
        let whereSql = ` WHERE b.is_deleted = 0 AND b.is_active = ? `;
        const params: string[] = [String(validIsActive)];

        // 账本分类ID筛选（精准匹配）
        if (bookCategoryId !== undefined && bookCategoryId > 0) {
            whereSql += ` AND b.book_category_id = ? `;
            params.push(String(bookCategoryId));
        }

        // 账本名称筛选（模糊搜索，适配用户搜索场景）
        if (name && name.trim()) {
            whereSql += ` AND b.name LIKE ? `;
            params.push(`%${name.trim()}%`);
        }

        // 用户ID筛选（仅查询指定用户的账本）
        if (userId !== undefined && userId > 0) {
            whereSql += ` AND b.user_id = ? `;
            params.push(String(userId));
        }

        let connection;
        try {
            connection = await pool.getConnection();

            // 3. 查询总记录数（仅查账本表，避免联表影响计数）
            const countSql = `
                SELECT COUNT(*) AS total
                FROM ${this.bookTableName} b
                    ${whereSql}
            `;
            const [countResult] = await connection.execute(countSql, params);
            const total = Number((countResult as any[])[0].total) || 0;

            // 4. 联表查询（账本+账本分类+用户，精准指定字段）
            const querySql = `
                SELECT b.id                                           AS bookId,
                       b.uuid,
                       b.icon,
                       b.name,
                       b.book_category_id                             AS bookCategoryId,
                       bc.name                                        AS bookCategoryName,
                       b.user_id                                      AS userId,
                       u.nickname                                     AS userName,
                       b.is_active                                    AS isActive,
                       b.is_default                                   AS isDefault,
                       b.currency                                     AS defaultCurrency,
                       b.description,
                       b.sort_order,
                       DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i:%s') AS createTime,
                       DATE_FORMAT(b.updated_at, '%Y-%m-%d %H:%i:%s') AS updateTime
                FROM ${this.bookTableName} b
                         LEFT JOIN ${this.bookCategoryTableName} bc ON b.book_category_id = bc.id
                         LEFT JOIN ${this.userTableName} u ON b.user_id = u.id
                    ${whereSql}
                ORDER BY b.sort_order ASC, b.created_at DESC
                    LIMIT ?, ?
            `;
            // 拼接分页参数
            const queryParams = [...params, String(offset), String(validPageSize)];
            const [listResult] = await connection.execute(querySql, queryParams);

            // 5. 结构化处理返回数据（空值兜底+字段标准化）
            const bookList: BookDetail[] = (listResult as any[]).map(item => ({
                bookId: item.bookId,
                uuid: item.uuid || '',
                name: item.name || '未命名账本',
                icon: item.icon || "https://gfok.54ndd.com/upload/2026-01/06_17503756.png",
                bookCategoryId: item.bookCategoryId || 0,
                bookCategoryName: item.bookCategoryName || '默认分类',
                userId: item.userId || 0,
                userName: item.userName || '系统',
                isActive: item.isActive || 0,
                isDefault: item.isDefault || 0,
                currency: item.currency || 'CNY',
                description: item.description,
                sort_order: item.sort_order || 0,
                createTime: item.createTime,
                updateTime: item.updateTime
            }));

            // 6. 组装最终返回结果
            return {
                code: 0,
                message: "查询账本列表成功",
                data: {
                    items: bookList,
                    total,
                    page: validPage,
                    pageSize: validPageSize,
                    totalPages: Math.ceil(total / validPageSize)
                }
            };
        } catch (e) {
            console.error("查询账本列表失败：", e);
            // 错误兜底返回
            return {
                code: 500,
                message: `查询账本失败：${(e as Error).message}`,
                data: {
                    items: [],
                    total: 0,
                    page: validPage,
                    pageSize: validPageSize,
                    totalPages: 0
                }
            };
        } finally {
            // 释放数据库连接（关键：避免连接池耗尽）
            if (connection) {
                connection.release();
            }
        }
    }

    /**
     * 扩展：根据ID查询单个账本详情
     * @param id 账本ID
     * @returns 单个账本信息
     */
    async findById(id: number): Promise<PageResult> {
        if (!id || id <= 0) {
            return {
                code: 400,
                message: "账本ID不能为空且必须为正整数",
                data: {items: [], total: 0, page: 1, pageSize: 1, totalPages: 0}
            };
        }

        let connection;
        try {
            connection = await pool.getConnection();
            const querySql = `
                SELECT b.id                                           AS bookId,
                       b.uuid,
                       b.name,
                       b.icon,
                       b.book_category_id                             AS bookCategoryId,
                       bc.name                                        AS bookCategoryName,
                       b.user_id                                      AS userId,
                       u.nickname                                     AS userName,
                       b.is_active                                    AS isActive,
                       b.is_default                                   AS isDefault,
                       b.currency                                     AS defaultCurrency,
                       b.description,
                       b.sort_order,
                       DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i:%s') AS createTime,
                       DATE_FORMAT(b.updated_at, '%Y-%m-%d %H:%i:%s') AS updateTime
                FROM ${this.bookTableName} b
                         LEFT JOIN ${this.bookCategoryTableName} bc ON b.book_category_id = bc.id
                         LEFT JOIN ${this.userTableName} u ON b.user_id = u.id
                WHERE b.id = ?
                  AND b.is_deleted = 0
            `;
            const [result] = await connection.execute(querySql, [String(id)]);

            let bookDetail: BookDetail | null = null;
            if ((result as any[]).length > 0) {
                const item = (result as any[])[0];
                bookDetail = {
                    bookId: item.bookId,
                    uuid: item.uuid || '',
                    name: item.name || '未命名账本',
                    icon: item.icon || "https://pics1.baidu.com/feed/5d6034a85edf8db14f885fb3e42fca52574e7451.jpeg?token=134b7be7b10db68e9212c48b1101f660&s=93965184414242FE5C343CC6030050B8",
                    bookCategoryId: item.bookCategoryId || 0,
                    bookCategoryName: item.bookCategoryName || '默认分类',
                    userId: item.userId || 0,
                    userName: item.userName || '系统',
                    isActive: item.isActive || 0,
                    isDefault: item.isDefault || 0,
                    currency: item.defaultCurrency || 'CNY',
                    description: item.description,
                    sort_order: item.sort_order || 0,
                    createTime: item.createTime,
                    updateTime: item.updateTime
                };
            }

            return {
                code: 200,
                message: bookDetail ? "查询账本成功" : "账本不存在",
                data: {
                    items: bookDetail ? [bookDetail] : [],
                    total: bookDetail ? 1 : 0,
                    page: 1,
                    pageSize: 1,
                    totalPages: bookDetail ? 1 : 0
                }
            };
        } catch (e) {
            console.error(`查询ID=${id}的账本失败：`, e);
            return {
                code: 500,
                message: `查询账本失败：${(e as Error).message}`,
                data: {items: [], total: 0, page: 1, pageSize: 1, totalPages: 0}
            };
        } finally {
            if (connection) connection.release();
        }
    }
}

export default new BookModule();