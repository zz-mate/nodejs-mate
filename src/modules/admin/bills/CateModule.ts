import pool from "../../../db";

// 定义分类数据结构化类型
interface CategoryDetail {
    categoryId: number; // 分类ID
    uuid: string;
    name: string; // 分类名称
    type: string; // 收支类型（income/expense）
    icon: string | null; // 分类图标
    sort: number; // 排序权重
    bookCategoryId: number; // 账本分类ID
    bookCategoryName: string; // 账本分类名称
    userId: number; // 创建用户ID
    userName: string; // 创建用户昵称
    isDefault: number; // 是否系统默认分类
    createTime: string;
    updateTime: string;
}

// 分页结果类型
interface PageResult {
    code: number;
    message: string;
    data: {
        items: CategoryDetail[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
}

class CateModule {
    private readonly categoryTableName = "mate_category";
    private readonly userTableName = "mate_user";
    private readonly bookCategoryTableName = "mate_book_category";

    /**
     * 分页查询分类列表（支持按类型/账本分类/用户筛选）
     * @param page 页码
     * @param pageSize 每页条数
     * @param type 收支类型（income/expense）
     * @param bookCategoryId 账本分类ID
     * @param userId 用户ID
     * @returns 标准化分页结果
     */
    async findAll(
        page: number,
        pageSize: number,
        type?: string,
        bookCategoryId?: number,
        userId?: number
    ): Promise<PageResult> {
        // 1. 参数校验与格式化（防非法参数）
        const validPage = Math.max(Number(page) || 1, 1);
        const validPageSize = Math.max(Math.min(Number(pageSize) || 10, 50), 1); // 限制最大50条
        const offset = Math.max((validPage - 1) * validPageSize, 0);

        // 2. 构建查询条件（防SQL注入，参数化传递）
        let whereSql = ` WHERE c.is_deleted = 0 `;
        const params: string[] = [];

        // 收支类型筛选（income/expense）
        if (type) {
            whereSql += ` AND c.type = ? `;
            params.push(type);
        }

        // 账本分类ID筛选（关联mate_book_category）
        if (bookCategoryId !== undefined && bookCategoryId > 0) {
            whereSql += ` AND c.book_category_id = ? `;
            params.push(String(bookCategoryId));
        }

        // 用户ID筛选（仅查询指定用户的自定义分类，系统默认分类全员可见）
        if (userId !== undefined && userId > 0) {
            whereSql += ` AND (c.user_id = ? OR c.is_default = 1) `;
            params.push(String(userId));
        }

        let connection;
        try {
            connection = await pool.getConnection();

            // 3. 查询总记录数（仅查分类表，避免联表影响计数）
            const countSql = `
        SELECT COUNT(*) AS total 
        FROM ${this.categoryTableName} c
        ${whereSql}
      `;
            const [countResult] = await connection.execute(countSql, params);
            const total = Number((countResult as any[])[0].total) || 0;

            // 4. 联表查询（分类+账本分类+用户，精准指定字段）
            const querySql = `
        SELECT 
          c.id AS categoryId,
          c.name,
          c.type,
          c.icon,
          c.sort_order,
          c.book_category_id AS bookCategoryId,
          bc.name AS bookCategoryName,
          c.user_id AS userId,
          u.nickname AS userName,
          c.is_active AS isActive,
          DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
          DATE_FORMAT(c.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
        FROM ${this.categoryTableName} c
        LEFT JOIN ${this.bookCategoryTableName} bc ON c.book_category_id = bc.id
        LEFT JOIN ${this.userTableName} u ON c.user_id = u.id
        ${whereSql}
        ORDER BY c.sort_order ASC, c.created_at DESC
        LIMIT ?, ?
      `;
            // 拼接分页参数
            const queryParams = [...params, String(offset), String(validPageSize)];
            const [listResult] = await connection.execute(querySql, queryParams);

            // 5. 结构化处理返回数据（空值兜底+字段标准化）
            const categoryList: CategoryDetail[] = (listResult as any[]).map(item => ({
                categoryId: item.categoryId,
                uuid: item.uuid || '',
                name: item.name || '-',
                type: item.type || 'expense',
                icon: item.icon,
                sort: item.sort || 0,
                bookCategoryId: item.bookCategoryId || 0,
                bookCategoryName: item.bookCategoryName || '默认账本分类',
                userId: item.userId || 0,
                userName: item.userName || '系统',
                isDefault: item.isDefault || 0,
                createTime: item.createdAt,
                updateTime: item.updatedAt
            }));

            // 6. 组装最终返回结果
            return {
                code: 0,
                message: "查询分类列表成功",
                data: {
                    items: categoryList,
                    total,
                    page: validPage,
                    pageSize: validPageSize,
                    totalPages: Math.ceil(total / validPageSize)
                }
            };
        } catch (e) {
            console.error("查询分类列表失败：", e);
            // 错误兜底返回
            return {
                code: 500,
                message: `查询分类失败：${(e as Error).message}`,
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
     * 扩展：根据ID查询单个分类详情
     * @param id 分类ID
     * @returns 单个分类信息
     */
    async findById(id: number): Promise<PageResult> {
        if (!id || id <= 0) {
            return {
                code: 400,
                message: "分类ID不能为空且必须为正整数",
                data: { items: [], total: 0, page: 1, pageSize: 1, totalPages: 0 }
            };
        }

        let connection;
        try {
            connection = await pool.getConnection();
            const querySql = `
        SELECT 
          c.id AS categoryId,
          c.uuid,
          c.name,
          c.type,
          c.icon,
          c.sort,
          c.book_category_id AS bookCategoryId,
          bc.name AS bookCategoryName,
          c.user_id AS userId,
          u.nickname AS userName,
          c.is_default AS isDefault,
          DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
          DATE_FORMAT(c.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
        FROM ${this.categoryTableName} c
        LEFT JOIN ${this.bookCategoryTableName} bc ON c.book_category_id = bc.id
        LEFT JOIN ${this.userTableName} u ON c.user_id = u.id
        WHERE c.id = ? AND c.is_deleted = 0
      `;
            const [result] = await connection.execute(querySql, [String(id)]);

            let categoryDetail: CategoryDetail | null = null;
            if ((result as any[]).length > 0) {
                const item = (result as any[])[0];
                categoryDetail = {
                    categoryId: item.categoryId,
                    uuid: item.uuid || '',
                    name: item.name || '-',
                    type: item.type || 'expense',
                    icon: item.icon,
                    sort: item.sort || 0,
                    bookCategoryId: item.bookCategoryId || 0,
                    bookCategoryName: item.bookCategoryName || '默认账本分类',
                    userId: item.userId || 0,
                    userName: item.userName || '系统',
                    isDefault: item.isDefault || 0,
                    createTime: item.createdAt,
                    updateTime: item.updatedAt
                };
            }

            return {
                code: 200,
                message: categoryDetail ? "查询分类成功" : "分类不存在",
                data: {
                    items: categoryDetail ? [categoryDetail] : [],
                    total: categoryDetail ? 1 : 0,
                    page: 1,
                    pageSize: 1,
                    totalPages: categoryDetail ? 1 : 0
                }
            };
        } catch (e) {
            console.error(`查询ID=${id}的分类失败：`, e);
            return {
                code: 500,
                message: `查询分类失败：${(e as Error).message}`,
                data: { items: [], total: 0, page: 1, pageSize: 1, totalPages: 0 }
            };
        } finally {
            if (connection) connection.release();
        }
    }


    /**
     * 创建账本收支分类
     * @param data 分类创建数据（驼峰命名入参）
     * @returns 创建成功的分类ID及基础信息
     */
    async create(data: {
        userId?: number;          // 非必传：用户ID（不传则为系统内置）
        bookId?: number;          // 非必传：账本ID
        bookCategoryId?: number;  // 可选：账本分类ID
        parentId?: number;        // 可选：父分类ID（默认0）
        name: string;             // 必传：分类名称
        type: 1 | 2 | 3;          // 必传：1-收入，2-支出，3-转账
        icon?: string;            // 可选：图标路径（默认空）
        color?: string;           // 可选：颜色（默认#333333）
        sortOrder?: number;       // 可选：排序序号（默认0）
        isSystem?: 0 | 1;         // 可选：是否系统内置（优先级低于userId规则）
        isActive?: 0 | 1;         // 可选：是否启用（默认1）
    }): Promise<{
        id: number;
        name: string;
        type: 1 | 2 | 3;
        isSystem: 0 | 1;
        message: string;
    }> {
        // 1. 核心必传参数校验
        if (!data.name || data.name.trim() === "") {
            throw new Error("分类名称不能为空");
        }
        if (![1, 2, 3].includes(data.type)) {
            throw new Error("分类类型必须是1（收入）、2（支出）或3（转账）");
        }

        // 2. 可选参数格式校验（传了则校验合法性）
        if (data.bookId !== undefined && data.bookId !== null) {
            if (!Number.isInteger(data.bookId) || data.bookId <= 0) {
                throw new Error("账本ID必须是正整数（若无需账本ID请直接不传）");
            }
        }
        if (data.userId !== undefined && data.userId !== null) {
            if (!Number.isInteger(data.userId) || data.userId <= 0) {
                throw new Error("用户ID必须是正整数（若无需用户ID请直接不传）");
            }
        }
        if (data.bookCategoryId !== undefined && data.bookCategoryId !== null) {
            if (!Number.isInteger(data.bookCategoryId) || data.bookCategoryId <= 0) {
                throw new Error("账本分类ID必须是正整数（若无需请直接不传）");
            }
        }

        // 3. 核心规则：根据userId判断是否为系统内置分类
        const isSystem = (() => {
            // 未传userId → 强制设为系统内置（isSystem=1）
            if (data.userId === undefined || data.userId === null) {
                return 1 as 0 | 1;
            }
            // 传了userId → 强制设为非系统内置（isSystem=0）
            return 0 as 0 | 1;
        })();

        // 4. 格式化参数（驼峰转下划线 + 设置默认值）
        const insertData = {
            user_id: data.userId === undefined || data.userId === null ? null : Number(data.userId),
            book_id: data.bookId === undefined || data.bookId === null ? null : Number(data.bookId),
            book_category_id: data.bookCategoryId ? Number(data.bookCategoryId) : null,
            parent_id: data.parentId ? Math.max(Number(data.parentId), 0) : 0, // 最小为0
            name: data.name.trim(),
            type: Number(data.type) as 1 | 2 | 3,
            icon: (data.icon || "").trim(),
            color: (data.color || "#333333").trim(),
            sort_order: data.sortOrder ? Math.max(Number(data.sortOrder), 0) : 0,
            is_system: isSystem, // 由userId规则自动决定，覆盖手动传入的值
            is_active: [0, 1].includes(Number(data.isActive)) ? Number(data.isActive) as 0 | 1 : 1,
        };

        try {
            // 5. 核心：全维度名称唯一性校验（userId+bookId+bookCategoryId+type+is_system）
            let checkSql = `
                SELECT COUNT(*) as count
                FROM ${this.categoryTableName}
                WHERE name = ?
                  AND type = ?
                  AND is_deleted = 0
                  AND is_system = ?
            `;
            const checkParams: any[] = [
                insertData.name,
                insertData.type,
                insertData.is_system
            ];

            // 维度1：userId（精准匹配null/具体值）
            if (insertData.user_id !== null) {
                checkSql += " AND user_id = ? ";
                checkParams.push(insertData.user_id);
            } else {
                checkSql += " AND user_id IS NULL ";
            }

            // 维度2：bookId（精准匹配null/具体值）
            if (insertData.book_id !== null) {
                checkSql += " AND book_id = ? ";
                checkParams.push(insertData.book_id);
            } else {
                checkSql += " AND book_id IS NULL ";
            }

            // 维度3：bookCategoryId（精准匹配null/具体值）
            if (insertData.book_category_id !== null) {
                checkSql += " AND book_category_id = ? ";
                checkParams.push(insertData.book_category_id);
            } else {
                checkSql += " AND book_category_id IS NULL ";
            }

            const [checkResult] = await pool.execute(checkSql, checkParams);
            const nameCount = (checkResult as Array<{ count: number }>)[0].count;

            if (nameCount > 0) {
                // 构造精准的错误提示
                const typeText = insertData.type === 1 ? "收入" : insertData.type === 2 ? "支出" : "转账";
                const systemText = insertData.is_system ? "系统内置" : "用户自定义";
                const userTip = insertData.user_id ? `用户【${insertData.user_id}】` : "无归属用户";
                const bookTip = insertData.book_id ? `账本【${insertData.book_id}】` : "无归属账本";
                const cateTip = insertData.book_category_id ? `账本分类【${insertData.book_category_id}】` : "无归属账本分类";

                throw new Error(`【${userTip}】-【${bookTip}】-【${cateTip}】下已存在名为「${insertData.name}」的${systemText}${typeText}分类，请勿重复创建`);
            }

            // 6. 执行插入操作（参数化查询防SQL注入）
            const insertSql = `
                INSERT INTO ${this.categoryTableName}
                (user_id, book_id, book_category_id, parent_id, name, type, icon, color, sort_order, is_system, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const [result] = await pool.execute(insertSql, [
                insertData.user_id,
                insertData.book_id,
                insertData.book_category_id,
                insertData.parent_id,
                insertData.name,
                insertData.type,
                insertData.icon,
                insertData.color,
                insertData.sort_order,
                insertData.is_system,
                insertData.is_active
            ]);

            // 7. 返回创建结果（驼峰命名返回）
            const insertResult = result as { insertId: number };
            return {
                id: insertResult.insertId,
                name: insertData.name,
                type: insertData.type,
                isSystem: insertData.is_system,
                message: insertData.is_system
                    ? "系统内置收支分类创建成功"
                    : "用户自定义收支分类创建成功"
            };
        } catch (error) {
            console.error("创建收支分类失败：", error);
            // 优先抛出业务校验错误
            if ((error as Error).message.includes("已存在")) {
                throw error;
            }
            // 处理数据库约束/格式异常
            if ((error as any).code === "ER_DATA_TOO_LONG") {
                throw new Error("输入的字段长度超过限制（名称最长50字符，图标最长100字符）");
            }
            if ((error as any).code === "ER_CHECK_CONSTRAINT_VIOLATED") {
                throw new Error("分类类型只能是1（收入）、2（支出）或3（转账）");
            }
            // 通用异常提示
            throw new Error(error instanceof Error ? error.message : "创建收支分类失败，请稍后重试");
        }
    }
}

export default new CateModule();