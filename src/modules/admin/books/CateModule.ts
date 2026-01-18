import pool from "../../../db";

class CateModule {
    private readonly bookCategoryTableName = "mate_book_category";

    /**
     * 分页查询分类列表（支持按类型/账本分类/用户筛选）
     * @param page 页码
     * @param pageSize 每页条数
     * @returns 标准化分页结果
     */
    async findAll(
        page: number,
        pageSize: number,
    ): Promise<
        any
    > {
        // 1. 参数校验与格式化（防非法参数）
        const validPage = Math.max(Number(page) || 1, 1);
        const validPageSize = Math.max(Math.min(Number(pageSize) || 10, 50), 1); // 限制最大50条
        const offset = Math.max((validPage - 1) * validPageSize, 0);

        try {
            // 2. 查询总条数（用于计算分页信息）
            const countSql = `SELECT COUNT(*) as total
                              FROM ${this.bookCategoryTableName}
                              WHERE is_deleted = 0`;
            const [countResult] = await pool.execute(countSql);
            const total = (countResult as Array<{ total: number }>)[0].total;

            // 3. 分页查询分类列表
            const listSql = `
                SELECT id,
                       name,
                       icon,
                       description,
                       color,
                       sort,
                       is_default,
                       is_deleted,
                       created_at,
                       updated_at
                FROM ${this.bookCategoryTableName}
                WHERE is_deleted = 0
                ORDER BY sort DESC, created_at DESC LIMIT ?
                OFFSET ?
            `;
            const [listResult] = await pool.execute(listSql, [String(validPageSize), String(offset)]);
            let list = listResult as Array<{
                    id: number;
                    name: string;
                    icon: string;
                    description: string;
                    color: string;
                    sort: number;
                    is_default: number;
                    is_deleted: number;
                    created_at: string;
                    updated_at: string;
                }>
            // 4. 构造标准化分页返回结果
            const totalPages = Math.ceil(total / validPageSize);
            return {
                code: 0,
                message: "ok",

                    data: [{id:0,name:"请选择"},...list],
                    pagination: {
                        page: validPage,
                        pageSize: validPageSize,
                        total,
                        totalPages

                }
            };
        } catch (error) {
            console.error("查询账本分类列表失败：", error);
            throw new Error("查询账本分类列表失败，请稍后重试");
        }
    }
    // 省略 findAll 方法...

    /**
     * 创建账本分类（增加名称唯一性校验）
     * @param data 分类创建数据
     * @returns 创建成功的分类ID及基础信息
     */
    async create(data: {
        name: string;
        icon?: string;
        description: string;
        color?: string;
        sort?: number;
        is_default?: number;
    }): Promise<{
        id: number;
        name: string;
        message: string;
    }> {
        // 1. 基础数据校验：必传字段检查
        if (!data.name || data.name.trim() === "") {
            throw new Error("分类名称不能为空");
        }
        if (!data.description || data.description.trim() === "") {
            throw new Error("分类描述不能为空");
        }

        // 2. 格式化字段（去空格 + 设置默认值）
        const insertData = {
            name: data.name.trim(),
            icon: (data.icon || "").trim(),
            description: data.description.trim(),
            color: data.color?.trim() || "#333333",
            sort: Number(data.sort) || 0,
            is_default: [0, 1].includes(Number(data.is_default)) ? Number(data.is_default) : 0,
        };

        try {
            // 3. 核心：名称唯一性校验（只校验未删除的分类）
            const checkSql = `
                SELECT COUNT(*) as count 
                FROM ${this.bookCategoryTableName} 
                WHERE name = ? AND is_deleted = 0
            `;
            const [checkResult] = await pool.execute(checkSql, [insertData.name]);
            const nameCount = (checkResult as Array<{ count: number }>)[0].count;

            if (nameCount > 0) {
                throw new Error(`分类名称「${insertData.name}」已存在，请勿重复创建`);
            }

            // 4. 执行插入操作
            const insertSql = `
                INSERT INTO ${this.bookCategoryTableName} 
                (name, icon, description, color, sort, is_default)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            const [result] = await pool.execute(insertSql, [
                insertData.name,
                insertData.icon,
                insertData.description,
                insertData.color,
                insertData.sort,
                insertData.is_default,
            ]);

            // 5. 返回创建结果
            const insertResult = result as { insertId: number };
            return {
                id: insertResult.insertId,
                name: insertData.name,
                message: "分类创建成功",
            };
        } catch (error) {
            console.error("创建账本分类失败：", error);
            // 优先抛出业务校验的自定义错误，再处理数据库异常
            if ((error as Error).message.includes("已存在")) {
                throw error;
            }
            // 处理其他数据库异常
            if ((error as any).code === "ER_DATA_TOO_LONG") {
                throw new Error("输入的字段长度超过限制，请检查分类名称/描述等内容");
            }
            throw new Error(error instanceof Error ? error.message : "创建账本分类失败，请稍后重试");
        }
    }
}

export default new CateModule();