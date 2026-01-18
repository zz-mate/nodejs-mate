import pool from "../../../db";

// 定义结构化返回的账单数据类型（新增账本信息）
interface BillDetail {
    billId: number; // 账单ID（重命名避免冲突）
    uuid: string;
    userId: number;
    bookId: number;
    book: { // 新增：账本信息（结构化包裹）
        id: number;
        name: string; // 账本名称
        type: string; // 账本类型（如个人/家庭/公司）
        defaultCurrency: string; // 账本默认币种
    };
    account: { // 账户信息（结构化包裹）
        id: number;
        name: string; // 账户名称
        type: string; // 账户类型（如微信/支付宝）
    };
    category: { // 分类信息（结构化包裹）
        id: number;
        name: string; // 分类名称
        type: string; // 分类类型（income/expense）
        icon?: string; // 分类图标
    };
    user: { // 用户信息（结构化包裹）
        id: number;
        nickname: string; // 用户昵称
        username: string; // 用户名
    };
    amount: number;
    type: string; // 收支类型（income/expense）
    remark: string | null;
    billTime: string;
    createdAt: string;
    updatedAt: string;
    // 快捷字段（前端展示用）
    accountName: string;
    nickname: string;
    categoryIcon: string | undefined;
    categoryName: string;
    categoryId: number;
    color: string;
}

// 分页结果类型
interface PageResult {
    code: number;
    message: string;
    data: {
        items: BillDetail[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
}

class BillModule {
    private readonly billTableName = "mate_bill";
    private readonly categoryTableName = "mate_category";
    private readonly userTableName = "mate_user";
    private readonly accountTableName = "mate_account";
    private readonly bookTableName = "mate_book"; // 新增：账本表

    /**
     * 分页查询账单列表（结构化返回+移除无用id+新增账本信息）
     */
    async findAll(
        page: number,
        pageSize: number,
        type?: string,
        startTime?: string,
        endTime?: string,
        isDeleted?: number,
        accountId?: number,
        categoryId?: number,
        bookId?: number,
        role?: string,
        userId?: number
    ): Promise<PageResult> {
        // 1. 参数校验与格式化
        const validPage = Math.max(Number(page) || 1, 1);
        const validPageSize = Math.max(Math.min(Number(pageSize) || 10, 50), 1);
        const offset = Math.max((validPage - 1) * validPageSize, 0);

        // 2. 构建查询条件（防SQL注入）
        let whereSql = ` WHERE b.is_deleted = COALESCE(?, b.is_deleted) `;
        const params: string[] = [];

        // 基础条件：是否删除
        if (isDeleted !== undefined) {
            params.push(String(isDeleted));
        } else {
            params.push("0"); // 默认查未删除的账单
        }

        // 用户ID筛选
        if (userId !== undefined) {
            whereSql += ` AND b.user_id = ? `;
            params.push(String(userId));
        }

        // 收支类型
        if (type) {
            whereSql += ` AND b.type = ? `;
            params.push(type);
        }

        // 时间范围
        if (startTime) {
            whereSql += ` AND b.bill_time >= ? `; // 修正：使用bill_time而非date
            params.push(startTime);
        }
        if (endTime) {
            whereSql += ` AND b.bill_time <= ? `; // 修正：使用bill_time而非date
            params.push(endTime);
        }

        // 账户ID
        if (accountId !== undefined) {
            whereSql += ` AND b.account_id = ? `;
            params.push(String(accountId));
        }

        // 分类ID
        if (categoryId !== undefined) {
            whereSql += ` AND b.category_id = ? `;
            params.push(String(categoryId));
        }

        // 账本ID
        if (bookId !== undefined) {
            whereSql += ` AND b.book_id = ? `;
            params.push(String(bookId));
        }

        // 角色权限控制
        if (role === "user" && userId === undefined) {
            throw new Error("普通用户查询账单必须指定userId");
        }

        let connection;
        try {
            connection = await pool.getConnection();

            // 3. 查询总记录数（仅查账单表，避免联表影响计数）
            const countSql = `
                SELECT COUNT(*) AS total
                FROM ${this.billTableName} b
                    ${whereSql}
            `;
            const [countResult] = await connection.execute(countSql, params);
            const total = Number((countResult as any[])[0].total) || 0;

            // 4. 联表查询（新增账本表关联+精准指定字段）
            const querySql = `
                SELECT
                    b.id AS billId,       -- 账单ID（重命名）
                    b.uuid,
                    b.user_id AS userId,
                    b.book_id AS bookId,
                    b.amount,
                    b.type,
                    b.tags,
                    b.remark,
                    DATE_FORMAT(b.bill_time, '%Y-%m-%d %H:%i') AS billTime,
                    DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
                    DATE_FORMAT(b.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt,
                    -- 账户信息（仅取有用字段）
                    a.id AS accountId,
                    a.name AS accountName,
                    a.type AS accountType,
                    -- 分类信息（仅取有用字段）
                    c.id AS categoryId,
                    c.name AS categoryName,
                    c.icon AS categoryIcon,
                    c.type AS categoryType,
                    -- 用户信息（仅取有用字段）
                    u.id AS userId_,      -- 临时别名，避免与账单user_id冲突
                    u.nickname,
                    u.username,
                    -- 新增：账本信息（仅取有用字段）
                    bo.id AS bookId_,
                    bo.name AS bookName,
                    bo.type AS bookType,
                    bo.currency AS defaultCurrency
                FROM ${this.billTableName} b
                         LEFT JOIN ${this.accountTableName} a ON b.account_id = a.id
                         LEFT JOIN ${this.categoryTableName} c ON b.category_id = c.id
                         LEFT JOIN ${this.userTableName} u ON b.user_id = u.id
                         LEFT JOIN ${this.bookTableName} bo ON b.book_id = bo.id -- 新增：关联账本表
                    ${whereSql}
                ORDER BY b.bill_time DESC, b.created_at DESC
                    LIMIT ?, ?
            `;
            const queryParams = [...params, String(offset), String(validPageSize)];
            const [listResult] = await connection.execute(querySql, queryParams);

            // 5. 结构化处理数据（包裹为对象+删除无用字段+新增账本信息）
            const billList: BillDetail[] = (listResult as any[]).map(item => ({
                billId: item.billId,
                uuid: item.uuid,
                userId: item.userId,
                bookId: item.bookId,
                // 新增：账本信息结构化包裹
                book: {
                    id: item.bookId_,
                    name: item.bookName || '-',
                    type: item.bookType || 'personal',
                    defaultCurrency: item.defaultCurrency || 'CNY'
                },
                // 账户信息结构化包裹
                account: {
                    id: item.accountId || 0,
                    name: item.accountName || '-',
                    type: item.accountType || '-'
                },
                // 分类信息结构化包裹
                category: {
                    id: item.categoryId || 0,
                    name: item.categoryName || '-',
                    type: item.categoryType || '-',
                    icon: item.categoryIcon
                },
                // 用户信息结构化包裹
                user: {
                    id: item.userId_ || 0,
                    nickname: item.nickname || '-',
                    username: item.username || '-'
                },
                // 快捷字段（前端展示用）
                bookName:item.bookName,
                accountName: item.accountName || '-',
                nickname: item.nickname || '-',
                categoryIcon: item.categoryIcon,
                categoryName: item.categoryName || '-',
                categoryId: item.categoryId || 0,
                // 核心字段
                amount: item.amount,
                type: item.type,
                remark: item.remark || '',
                billTime: item.billTime,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
                tags:JSON.parse(item.tags).length || '-',
                // 收支类型颜色（优化：兼容type为数字/字符串的情况）
                color: (item.type == 1) ? '#FF3860' : '#57d188'
            }));

            // 6. 组装最终返回结果
            return {
                code: 0,
                message: "查询账单列表成功",
                data: {
                    items: billList,
                    total,
                    page: validPage,
                    pageSize: validPageSize,
                    totalPages: Math.ceil(total / validPageSize),
                },
            };
        } catch (e) {
            console.error("查询账单列表失败：", e);
            return {
                code: 500,
                message: `查询账单失败：${(e as Error).message}`,
                data: {
                    items: [],
                    total: 0,
                    page: validPage,
                    pageSize: validPageSize,
                    totalPages: 0,
                },
            };
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }

    /**
     * 根据ID查询单个账单（结构化返回+移除无用id+新增账本信息）
     */
    async findById(id: number): Promise<PageResult> {
        let connection;
        try {
            connection = await pool.getConnection();
            const querySql = `
                SELECT
                    b.id AS billId,
                    b.uuid,
                    b.user_id AS userId,
                    b.book_id AS bookId,
                    b.amount,
                    b.type,
                    b.remark,
                    DATE_FORMAT(b.bill_time, '%Y-%m-%d %H:%i') AS billTime,
                    DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i:%s') AS createdAt,
                    DATE_FORMAT(b.updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt,
                    -- 账户信息
                    a.id AS accountId,
                    a.name AS accountName,
                    a.type AS accountType,
                    -- 分类信息
                    c.id AS categoryId,
                    c.name AS categoryName,
                    c.icon AS categoryIcon,
                    c.type AS categoryType,
                    -- 用户信息
                    u.id AS userId_,
                    u.nickname,
                    u.username,
                    -- 新增：账本信息
                    bo.id AS bookId_,
                    bo.name AS bookName,
                    bo.type AS bookType,
                    bo.currency AS defaultCurrency
                FROM ${this.billTableName} b
                         LEFT JOIN ${this.accountTableName} a ON b.account_id = a.id
                         LEFT JOIN ${this.categoryTableName} c ON b.category_id = c.id
                         LEFT JOIN ${this.userTableName} u ON b.user_id = u.id
                         LEFT JOIN ${this.bookTableName} bo ON b.book_id = bo.id -- 新增：关联账本表
                WHERE b.id = ? AND b.is_deleted = 0
            `;
            const [result] = await connection.execute(querySql, [String(id)]);

            let billDetail: BillDetail | null = null;
            if ((result as any[]).length > 0) {
                const item = (result as any[])[0];
                billDetail = {
                    billId: item.billId,
                    uuid: item.uuid,
                    userId: item.userId,
                    bookId: item.bookId,
                    // 新增：账本信息
                    book: {
                        id: item.bookId_,
                        name: item.bookName || '-',
                        type: item.bookType || 'personal',
                        defaultCurrency: item.defaultCurrency || 'CNY'
                    },
                    // 账户信息
                    account: {
                        id: item.accountId || 0,
                        name: item.accountName || '-',
                        type: item.accountType || '-'
                    },
                    // 分类信息
                    category: {
                        id: item.categoryId || 0,
                        name: item.categoryName || '-',
                        type: item.categoryType || '-',
                        icon: item.categoryIcon
                    },
                    // 用户信息
                    user: {
                        id: item.userId_ || 0,
                        nickname: item.nickname || '-',
                        username: item.username || '-'
                    },
                    // 快捷字段
                    accountName: item.accountName || '-',
                    nickname: item.nickname || '-',
                    categoryIcon: item.categoryIcon,
                    categoryName: item.categoryName || '-',
                    categoryId: item.categoryId || 0,
                    // 核心字段
                    amount: item.amount,
                    type: item.type,
                    remark: item.remark || '',
                    billTime: item.billTime,
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                    // 收支类型颜色
                    color: (item.type == 1 ) ? '#FF3860' : '#57d188'
                };
            }

            return {
                code: 200,
                message: billDetail ? "查询账单成功" : "账单不存在",
                data: {
                    items: billDetail ? [billDetail] : [],
                    total: billDetail ? 1 : 0,
                    page: 1,
                    pageSize: 1,
                    totalPages: billDetail ? 1 : 0,
                },
            };
        } catch (e) {
            console.error(`查询ID=${id}的账单失败：`, e);
            return {
                code: 500,
                message: `查询账单失败：${(e as Error).message}`,
                data: {
                    items: [],
                    total: 0,
                    page: 1,
                    pageSize: 1,
                    totalPages: 0,
                },
            };
        } finally {
            if (connection) connection.release();
        }
    }
}

export default new BillModule();