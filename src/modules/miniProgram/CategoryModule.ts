import pool from "../../db";
import {OkPacket, RowDataPacket} from 'mysql2/promise'; // 引入类型定义
import type {CategoryDbSchema} from "../../types";

class UserModule {
    categoryTableName = "mate_category";
    bookTableName = "mate_book";
    billTableName = "mate_bill";

    /**
     * 查询分类是否存在
     * @param category_id
     */
    async findById(category_id: number): Promise<CategoryDbSchema | null> {
        const [rows] = await pool.execute(
            `SELECT id
             FROM ${this.categoryTableName}
             WHERE id = ? LIMIT 1`,
            [category_id]
        );
        const category = (rows as CategoryDbSchema[])[0];
        return category || null;
    }

    async categoryList(
        userId?: number | string,
        page: number = 1,
        pageSize: number = 10,
        type?: 1 | 2 | 3 | number | string,
        bookCategoryId?: number
    ): Promise<any> {
        try {
            const validPage = Math.max(Number(page) || 1, 1);
            const validPageSize = Math.max(Number(pageSize) || 10, 1);
            const offset = (validPage - 1) * validPageSize;

            // ========== 第一步：极简查询，先确保能查到数据 ==========
            // 临时注释复杂条件，只查基础有效数据
            const [tempRows] = await pool.execute(
                `SELECT id, name, type, parent_id
                 FROM ${this.categoryTableName}
                 WHERE is_active = 1
                   AND is_deleted = 0
                   AND parent_id = 0 LIMIT ?, ?`,
                [offset + '', validPageSize + ''] // 修复：移除多余的字符串拼接，直接传数字
            );
            // console.log("极简查询结果：", tempRows); // 这里必须有数据！

            // ========== 第二步：如果极简查询有数据，再逐步加条件 ==========
            let whereConditions: string[] = [
                "c.is_active = 1",
                "c.is_deleted = 0",
                "c.parent_id = 0",
            ];
            let queryParams: any[] = [];

            // 1. 处理 userId（简化逻辑，先不关联删除表）
            const validUserId = Number(userId);
            if (validUserId && validUserId > 0) {
                whereConditions.push("(c.user_id = ? OR c.user_id IS NULL)");
                queryParams.push(validUserId);
            } else {
                whereConditions.push("c.user_id IS NULL");
            }

            // 2. 处理 type 过滤
            const validType = Number(type);
            if ([1, 2, 3].includes(validType)) {
                whereConditions.push("c.type = ?");
                queryParams.push(validType);
            }

            // 3. 处理 bookCategoryId：你的表中 book_id 全为 NULL，传值必空！
            if (bookCategoryId) {
                // 提示：你的表 book_id 都是 NULL，传这个参数会过滤空
                console.warn(
                    "警告：表中 book_id 全为 NULL，传 bookCategoryId 会无数据"
                );
                // whereConditions.push("c.book_id = ?");
                // queryParams.push(bookCategoryId);
            }

            // 4. 临时注释删除表关联（先确保基础查询有数据）
            // 修复：增加 userId 非空判断，避免传入 0 导致的错误
            if (validUserId && validUserId > 0) {
                whereConditions.push(
                    "c.id NOT IN (SELECT category_id FROM mate_category_user_delete WHERE user_id = ?)"
                );
                queryParams.push(validUserId);
            }

            // ========== 统计总数（关联排序表，但不影响总数） ==========
            const [totalRows] = await pool.execute(
                `SELECT COUNT(*) AS total
                 FROM ${this.categoryTableName} c
                          LEFT JOIN mate_category_user_sort s
                                    ON c.id = s.category_id
                                        AND s.user_id = ?
                                        AND (s.book_id = ? OR s.book_id IS NULL)
                 WHERE ${whereConditions.join(" AND ")}`,
                // 总数查询的排序表参数：userId、bookCategoryId
                [validUserId || null, bookCategoryId || null, ...queryParams]
            );
            const total = Number((totalRows as any[])[0]?.total || 0);
            const totalPage = Math.ceil(total / validPageSize);

            // ========== 查询顶级分类（核心：关联自定义排序表） ==========
            const [topCategoryRows] = await pool.execute(
                `SELECT c.id,
                        c.user_id,
                        c.book_id,
                        c.parent_id,
                        c.name,
                        c.type,
                        c.icon,
                        c.color,
                        c.sort_order                                   AS default_sort,
                        IFNULL(s.sort_order, c.sort_order)             AS final_sort_order, -- 优先自定义排序
                        c.is_system,
                        c.is_active,
                        DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                        DATE_FORMAT(c.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
                 FROM ${this.categoryTableName} c
                          LEFT JOIN mate_category_user_sort s
                                    ON c.id = s.category_id
                                        AND s.user_id = ?
                                        AND (s.book_id = ? OR s.book_id IS NULL)
                 WHERE ${whereConditions.join(" AND ")}
                 ORDER BY final_sort_order ASC LIMIT ?, ?`, // 按最终排序值排序
                // 参数顺序：排序表user_id、排序表book_id、查询条件参数、offset、pageSize
                [
                    validUserId || null,
                    bookCategoryId || null,
                    ...queryParams,
                    offset.toString(),
                    validPageSize.toString(),
                ]
            );
            // console.log("带条件查询结果：", topCategoryRows);

            // ========== 查询所有分类用于构建树形（关联自定义排序） ==========
            const [allCategoryRows] = await pool.execute(
                `SELECT c.id,
                        c.user_id,
                        c.book_id,
                        c.parent_id,
                        c.name,
                        c.type,
                        c.sort_order                       AS default_sort,
                        IFNULL(s.sort_order, c.sort_order) AS final_sort_order
                 FROM ${this.categoryTableName} c
                          LEFT JOIN mate_category_user_sort s
                                    ON c.id = s.category_id
                                        AND s.user_id = ?
                                        AND (s.book_id = ? OR s.book_id IS NULL)
                 WHERE c.is_active = 1
                   AND c.is_deleted = 0
                   AND (c.user_id IS NULL ${validUserId && validUserId > 0 ? `OR c.user_id = ?` : ""})`,
                // 参数：排序表user_id、排序表book_id、可选的user_id
                validUserId && validUserId > 0
                    ? [validUserId, bookCategoryId || null, validUserId]
                    : [validUserId || null, bookCategoryId || null]
            );

            // ========== 格式化 + 构建树形 ==========
            interface CategoryDbSchema {
                id: number;
                user_id: number | null;
                book_id: number | null;
                parent_id: number;
                name: string;
                type: 1 | 2 | 3;
                icon: string;
                color: string;
                sort_order: number; // 兼容原有字段
                final_sort_order: number; // 新增：最终排序值
                default_sort: number; // 新增：默认排序值
                is_system: 0 | 1;
                is_active: 0 | 1;
                created_at: string;
                updated_at: string;
                children: CategoryDbSchema[];
                status?: Boolean;
            }

            const formatCategory = (item: any): CategoryDbSchema => ({
                id: Number(item.id || 0),
                user_id: item.user_id !== null ? Number(item.user_id) : null,
                book_id: item.book_id !== null ? Number(item.book_id) : null,
                parent_id: Number(item.parent_id || 0),
                name: item.name || "",
                type: [1, 2, 3].includes(Number(item.type))
                    ? (Number(item.type) as 1 | 2 | 3)
                    : 1,
                icon: item.icon || "",
                color: item.color || "#333333",
                sort_order: Number(item.final_sort_order || item.sort_order || 0), // 兼容原有排序字段
                final_sort_order: Number(item.final_sort_order || item.sort_order || 0),
                default_sort: Number(item.default_sort || item.sort_order || 0),
                is_system: (item.is_system ? Number(item.is_system) : 0) as 0 | 1,
                is_active: (item.is_active ? Number(item.is_active) : 0) as 0 | 1,
                created_at: item.created_at || "",
                updated_at: item.updated_at || "",
                children: [] as CategoryDbSchema[],
                status: true,
            });

            const allCategories = Array.isArray(allCategoryRows)
                ? (allCategoryRows as any[]).map(formatCategory)
                : [];
            const topCategories = Array.isArray(topCategoryRows)
                ? (topCategoryRows as any[]).map(formatCategory)
                : [];

            // 修复：树形子分类按 final_sort_order 排序
            const buildTree = (
                allCats: CategoryDbSchema[],
                parentId: number
            ): CategoryDbSchema[] => {
                return allCats
                    .filter((cat) => cat.parent_id === parentId)
                    .sort((a, b) => a.final_sort_order - b.final_sort_order) // 子分类按最终排序
                    .map((cat) => ({...cat, children: buildTree(allCats, cat.id)}));
            };

            // 顶级分类也按最终排序值排序
            const sortedTopCategories = topCategories.sort((a, b) => a.final_sort_order - b.final_sort_order);

            const treeCategories = sortedTopCategories.map((topCat) => ({
                ...topCat,
                children: buildTree(allCategories, topCat.id),
            }));

            return {
                list: treeCategories,
                pagination: {
                    total,
                    page: validPage,
                    pageSize: validPageSize,
                    totalPage,
                },
            };
        } catch (error: any) {
            console.error("查询失败：", error.message, error.stack);
            return {
                list: [],
                pagination: {total: 0, page: 1, pageSize: 10, totalPage: 0},
            };
        }
    }

    async create(userId: number): Promise<any> {
    }

    /**
     * 校验分类是否关联账单（mate_bill）
     * 核心逻辑：仅查询分类ID是否存在关联的账单记录，返回布尔标识
     * @param categoryId 分类ID
     * @returns 校验结果（是否关联账单）
     */
    async cateBindBill(categoryId: number, currentUserId: number): Promise<{
        code: number;
        message: string;
        hasBill: boolean; // true=关联账单，false=无关联
    }> {
        // 前置参数校验
        if (!Number.isInteger(categoryId) || categoryId <= 0) {
            return {
                code: 400,
                message: "分类ID必须为正整数",
                hasBill: false
            };
        }

        try {
            // 精准查询分类是否关联账单（仅判断存在性，LIMIT 1优化性能）
            const [billCountRows] = await pool.execute(
                `SELECT 1
                 FROM mate_bill
                 WHERE category_id = ?
                   AND user_id = ? LIMIT 1`,
                [categoryId, currentUserId]
            );
            const hasBill = Array.isArray(billCountRows) && billCountRows.length > 0;

            return {
                code: 200,
                message: hasBill ? "该分类关联账单" : "该分类无关联账单",
                hasBill
            };
        } catch (error: any) {
            console.error("校验分类账单关联失败：", error.message);
            return {
                code: 500,
                message: `校验失败：${error.message || "数据库异常"}`,
                hasBill: false
            };
        }
    }

    /**
     * 删除分类（支持系统/公共/自定义分类）+ 批量逻辑删除关联账单
     * 最终修复：移除所有不存在的字段（deleted_at/created_at），适配实际表结构
     * 核心规则：
     * 1. 自定义分类：软删除（is_deleted=1）+ 级联子分类
     * 2. 系统/公共分类：仅标记用户删除（插入mate_category_user_delete）+ 级联子分类
     * 3. 账单处理：仅标记is_deleted=1（逻辑删除），不操作不存在的字段
     * @param categoryId 分类ID
     * @param currentUserId 当前操作用户ID
     * @param deleteBill 是否逻辑删除关联账单（true=删除，false=不删除）
     * @returns 删除结果
     */
    async deleteCate(
        categoryId: number,
        currentUserId: number,
        deleteBill: boolean = false
    ): Promise<{
        code: number;
        message: string;
        deleteBillCount?: number; // 逻辑删除的账单数量（仅deleteBill=true时返回）
    }> {
        // 前置参数校验
        if (!Number.isInteger(categoryId) || categoryId <= 0) {
            throw new Error("分类ID必须为正整数");
        }
        if (!Number.isInteger(currentUserId) || currentUserId <= 0) {
            throw new Error("用户ID必须为正整数");
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            console.log("删除分类参数：", {categoryId, currentUserId, deleteBill});

            // 1. 查询分类信息（加锁避免并发修改）
            const [categoryRows] = await conn.execute(
                `SELECT id, user_id, is_system
                 FROM ${this.categoryTableName}
                 WHERE id = ? FOR UPDATE`,
                [categoryId]
            );
            const category = (categoryRows as Array<any>)[0];
            if (!category) {
                throw new Error("分类不存在");
            }

            // 2. 权限校验：仅允许删除自己的自定义分类 或 公共/系统分类
            if (category.user_id !== null && category.user_id !== currentUserId) {
                throw new Error("无权删除他人的自定义分类");
            }

            // 3. 可选：批量逻辑删除该分类关联的所有账单（移除deleted_at，仅保留is_deleted）
            let deleteBillCount = 0;
            if (deleteBill) {
                const [billDeleteResult] = await conn.execute(
                    `UPDATE mate_bill
                     SET is_deleted = 1
                     WHERE user_id = ?
                       AND category_id = ?
                       AND is_deleted = 0`, // 仅保留存在的字段
                    [currentUserId, categoryId]
                );
                deleteBillCount = Number((billDeleteResult as any)?.affectedRows || 0);
                console.log(`批量逻辑删除分类${categoryId}关联的账单，共处理${deleteBillCount}条`);
            }

            // 4. 分类型处理分类删除逻辑
            if (category.user_id === currentUserId) {
                // 4.1 自定义分类：软删除 + 级联子分类软删除（分类表有deleted_at，保留）
                await conn.execute(
                    `UPDATE ${this.categoryTableName}
                     SET is_deleted = 1,
                         deleted_at = NOW(),
                         updated_at = NOW()
                     WHERE id = ?
                       AND user_id = ?`,
                    [categoryId, currentUserId]
                );
                // 级联删除子分类
                await conn.execute(
                    `UPDATE ${this.categoryTableName}
                     SET is_deleted = 1,
                         deleted_at = NOW(),
                         updated_at = NOW()
                     WHERE parent_id = ?
                       AND user_id = ?`,
                    [categoryId, currentUserId]
                );
            } else if (category.user_id === null) {
                // 4.2 系统/公共分类：插入删除关联记录（移除created_at字段）
                await conn.execute(
                    `INSERT
                    IGNORE INTO mate_category_user_delete (user_id, category_id) 
         VALUES (?, ?)`, // 仅保留表中存在的字段
                    [currentUserId, categoryId]
                );
                // 级联标记子分类（同样移除created_at）
                const [childCategoryRows] = await conn.execute(
                    `SELECT id
                     FROM ${this.categoryTableName}
                     WHERE parent_id = ?
                       AND user_id IS NULL`,
                    [categoryId]
                );
                const childIds = (childCategoryRows as Array<{ id: number }>)
                    .map(item => item.id)
                    .filter(Boolean);
                if (childIds.length > 0) {
                    const placeholders = childIds.map(() => "(?, ?)").join(",");
                    const insertParams = childIds.flatMap(id => [currentUserId, id]);
                    await conn.execute(
                        `INSERT
                        IGNORE INTO mate_category_user_delete (user_id, category_id) 
           VALUES
                        ${placeholders}`, // 仅保留存在的字段
                        insertParams
                    );
                }
            }

            await conn.commit();

            // 构造返回结果
            const result: any = {
                code: 200,
                message: deleteBill
                    ? `分类删除成功，同时逻辑删除${deleteBillCount}条关联账单`
                    : "分类删除成功（未删除关联账单）"
            };
            // 仅删除账单时返回删除数量
            if (deleteBill) {
                result.deleteBillCount = deleteBillCount;
            }
            return result;
        } catch (error: any) {
            await conn.rollback();
            console.error("删除分类失败：", error.message, error.stack);
            throw new Error(`删除分类失败：${error.message || "未知错误"}`);
        } finally {
            if (conn) conn.release();
        }
    }

    /**
     * 获取用户已删除的分类列表（关联分类表 + 分页 + type过滤 + bookCategoryId过滤）
     * 核心规则：
     * - 不传userId/传无效值：返回空（仅允许查自己删除的分类）
     * - 传有效userId：查该用户在mate_category_user_delete中标记删除的分类，关联分类表获取详情
     * - type可选过滤：1=收入，2=支出，3=转账，不传则不过滤
     * - bookCategoryId可选过滤：过滤分类表中 book_id = 传入值 的分类（仅传有效ID时生效）
     * @param userId 用户ID（必填，仅查该用户删除的分类）
     * @param page 页码（默认1）
     * @param pageSize 每页条数（默认10）
     * @param type 分类类型（可选：1/收入 2/支出 3/转账）
     * @param bookCategoryId 账本分类ID（可选，过滤分类表的book_id字段）
     * @returns 已删除的分类列表（树形结构）+ 分页信息
     */
    async categoryaDeleteList(
        userId?: number | string,
        page: number = 1,
        pageSize: number = 10,
        type?: 1 | 2 | 3 | number | string,
        bookCategoryId?: number
    ): Promise<any> {
        try {
            // 1. 基础参数校验与标准化
            const validUserId = userId !== undefined ? Number(userId) : 0;
            const isEffectiveUserId =
                Number.isInteger(validUserId) && validUserId > 0;
            // 不传/无效userId直接返回空（仅允许查自己删除的分类）
            if (!isEffectiveUserId) {
                return {
                    list: [],
                    pagination: {
                        total: 0,
                        page: 1,
                        pageSize: 10,
                        totalPage: 0,
                    },
                };
            }

            // 分页参数标准化（强制数字，避免NaN）
            const validPage = Math.max(Number.isInteger(+page) ? +page : 1, 1);
            const validPageSize = Math.max(
                Number.isInteger(+pageSize) ? +pageSize : 10,
                1
            );
            const offset = (validPage - 1) * validPageSize;

            // 2. 构建查询条件（关联分类表 + 删除表）
            let whereConditions: string[] = [
                "c.is_active = 1", // 分类仍启用（只是用户标记删除）
                "c.is_deleted = 0", // 分类未被软删除
                "d.user_id = ?", // 仅当前用户删除的分类
            ];
            let queryParams: any[] = [validUserId]; // 先传入用户ID

            // 2.1 分类类型过滤（1/收入 2/支出 3/转账）
            const validType = type !== undefined ? Number(type) : 0;
            if (Number.isInteger(validType) && [1, 2, 3].includes(validType)) {
                whereConditions.push("c.type = ?");
                queryParams.push(validType);
            }

            // 2.2 账本ID过滤（book_id）
            const validBookId =
                bookCategoryId !== undefined ? Number(bookCategoryId) : 0;
            if (Number.isInteger(validBookId) && validBookId > 0) {
                // whereConditions.push("c.book_id = ?");
                // queryParams.push(validBookId);
            }

            const whereSql = whereConditions.join(" AND ");

            // 3. 步骤1：查询已删除分类的总数（关联表统计）
            const [totalRows] = await pool.execute(
                `SELECT COUNT(DISTINCT c.id) AS total
                 FROM mate_category_user_delete d
                          LEFT JOIN ${this.categoryTableName} c ON d.category_id = c.id
                 WHERE ${whereSql}`,
                [...queryParams]
            );
            const total = Number((totalRows as any[])[0]?.total || 0);
            const totalPage = Math.ceil(total / validPageSize);

            // 4. 步骤2：分页查询已删除的分类详情（关联分类表）
            const [deleteCategoryRows] = await pool.execute(
                `SELECT c.id,
                        c.user_id,
                        c.book_id,
                        c.parent_id,
                        c.name,
                        c.type,
                        c.icon,
                        c.color,
                        c.sort_order,
                        c.is_system,
                        c.is_active,
                        c.created_at,
                        c.updated_at,
                        d.deleted_at AS user_delete_time, -- 用户标记删除的时间
                        d.id         AS mcudId            -- 用户标记删除的时间
                 FROM mate_category_user_delete d
                          LEFT JOIN ${this.categoryTableName} c ON d.category_id = c.id
                 WHERE ${whereSql}
                 ORDER BY d.deleted_at DESC, c.sort_order ASC LIMIT ?, ?`,
                [...queryParams, offset + "", validPageSize + ""] // 追加分页参数
            );
            // console.log("用户已删除的分类数据：", deleteCategoryRows);

            // 5. 步骤3：查询所有已删除分类的子分类（用于构建树形）
            // 先获取所有已删除的分类ID
            const [deleteIdsRows] = await pool.execute(
                `SELECT DISTINCT d.category_id
                 FROM mate_category_user_delete d
                          LEFT JOIN ${this.categoryTableName} c ON d.category_id = c.id
                 WHERE ${whereSql}`,
                [...queryParams]
            );
            const deleteCategoryIds =
                (deleteIdsRows as any[]).map((item) => item.category_id) || [];
            if (deleteCategoryIds.length === 0) {
                return {
                    list: [],
                    pagination: {
                        total,
                        page: validPage,
                        pageSize: validPageSize,
                        totalPage,
                    },
                };
            }

            // 查询这些分类的所有子分类（关联分类表）
            const [allDeleteChildRows] = await pool.execute(
                `SELECT c.id,
                        c.user_id,
                        c.book_id,
                        c.parent_id,
                        c.name,
                        c.type,
                        c.icon,
                        c.color,
                        c.sort_order,
                        c.is_system,
                        c.is_active,
                        c.created_at,
                        c.updated_at
                 FROM ${this.categoryTableName} c
                 WHERE c.parent_id IN (${deleteCategoryIds.join(",")})
                   AND c.is_active = 1
                   AND c.is_deleted = 0`,
                []
            );

            // 6. 格式化分类数据（统一字段类型）
            interface DeleteCategorySchema {
                id: number;
                user_id: number | null;
                book_id: number | null;
                parent_id: number;
                name: string;
                type: 1 | 2 | 3;
                icon: string;
                color: string;
                sort_order: number;
                is_system: 0 | 1;
                is_active: 0 | 1;
                created_at: string;
                updated_at: string;
                user_delete_time?: string; // 用户标记删除的时间
                mcudId?: number;

                children: DeleteCategorySchema[];
            }

            const formatDeleteCategory = (item: any, isParent = false): DeleteCategorySchema => ({
                id: Number(item.id || 0),
                user_id: Number(item.user_id),
                book_id: item.book_id !== null ? Number(item.book_id) : null,
                parent_id: Number(item.parent_id || 0),
                name: item.name || "",
                type: [1, 2, 3].includes(Number(item.type))
                    ? (Number(item.type) as 1 | 2 | 3)
                    : 1,
                icon: item.icon || "",
                color: item.color || "#333333",
                sort_order: Number(item.sort_order || 0),
                is_system: (item.is_system ? Number(item.is_system) : 0) as 0 | 1,
                is_active: (item.is_active ? Number(item.is_active) : 0) as 0 | 1,
                created_at: item.created_at || "",
                updated_at: item.updated_at || "",
                user_delete_time: isParent ? item.user_delete_time || "" : undefined, // 仅父分类显示删除时间
                mcudId: item.mcudId || "",
                children: [] as DeleteCategorySchema[],
            });

            // 格式化父分类（用户直接删除的分类）
            const parentCategories = Array.isArray(deleteCategoryRows)
                ? (deleteCategoryRows as any[]).map((item) =>
                    formatDeleteCategory(item, true)
                )
                : [];
            // console.log(parentCategories,123)
            // 格式化子分类
            const childCategories = Array.isArray(allDeleteChildRows)
                ? (allDeleteChildRows as any[]).map((item) =>
                    formatDeleteCategory(item)
                )
                : [];

            // 7. 构建树形结构（父分类 + 子分类）
            const buildDeleteTree = (
                parentCats: DeleteCategorySchema[],
                childCats: DeleteCategorySchema[]
            ): DeleteCategorySchema[] => {
                return parentCats.map((parentCat) => ({
                    ...parentCat,
                    children: childCats.filter(
                        (childCat) => childCat.parent_id === parentCat.id
                    ),
                }));
            };
            const treeCategories = buildDeleteTree(parentCategories, childCategories);

            // 8. 返回最终结果
            return {
                list: treeCategories,
                pagination: {
                    total,
                    page: validPage,
                    pageSize: validPageSize,
                    totalPage,
                },
            };
        } catch (error: any) {
            console.error("获取已删除分类列表失败：", error.message, error.stack);
            // 异常兜底
            return {
                list: [],
                pagination: {
                    total: 0,
                    page: Math.max(Number.isInteger(+page) ? +page : 1, 1),
                    pageSize: Math.max(Number.isInteger(+pageSize) ? +pageSize : 10, 1),
                    totalPage: 0,
                },
            };
        }
    }


    /**
     * 移除用户的分类删除记录（恢复被用户标记删除的分类）
     * 核心规则：
     * - 仅允许删除当前用户自己的删除记录（避免越权）
     * - 需同时传入分类删除关联ID 或 分类ID + 用户ID（二选一，优先categoryDeleteId）
     * - 返回删除结果（成功/失败 + 影响行数）
     * @param categoryDeleteId mate_category_user_delete表的主键ID（可选，优先级更高）
     * @param currentUserId 当前操作的用户ID（必填，校验权限）
     * @param categoryId 分类ID（可选，若传则按【分类ID+用户ID】删除）
     * @returns 删除结果
     */
    async removeCategoryDelete(
        categoryDeleteId?: number,
        currentUserId: number = 0,
        categoryId?: number
    ): Promise<{
        code: number;
        success: boolean;
        message: string;
        affectedRows: number;
    }> {
        try {
            // 1. 基础参数校验
            if (!currentUserId || !Number.isInteger(currentUserId) || currentUserId <= 0) {
                return {
                    code: 403,
                    success: false,
                    message: "当前用户ID无效，请传入有效的用户ID",
                    affectedRows: 0,
                };
            }

            // 2. 构建删除条件（优先按主键ID，其次按分类ID+用户ID）
            let deleteSql = "";
            let queryParams: any[] = [];

            if (categoryDeleteId && Number.isInteger(categoryDeleteId) && categoryDeleteId > 0) {
                // 条件1：按mate_category_user_delete表主键ID删除（精准）
                deleteSql = `DELETE
                             FROM mate_category_user_delete
                             WHERE id = ?
                               AND user_id = ?`;
                queryParams = [categoryDeleteId, currentUserId];
            } else if (categoryId && Number.isInteger(categoryId) && categoryId > 0) {
                // 条件2：按分类ID+用户ID删除（恢复该用户删除的指定分类）
                deleteSql = `DELETE
                             FROM mate_category_user_delete
                             WHERE category_id = ?
                               AND user_id = ?`;
                queryParams = [categoryId, currentUserId];
            } else {
                return {
                    code: 403,
                    success: false,
                    message: "缺少必要参数：需传入分类删除记录ID 或 分类ID",
                    affectedRows: 0,
                };
            }

            // 3. 执行删除操作
            const [result] = await pool.execute(deleteSql, queryParams);
            const affectedRows = Number((result as any)?.affectedRows || 0);

            // 4. 结果判断
            if (affectedRows > 0) {
                return {
                    code: 200,
                    success: true,
                    message: `成功移除${affectedRows}条分类删除记录，分类已恢复`,
                    affectedRows,
                };
            } else {
                return {
                    code: 403,
                    success: false,
                    message: "未找到匹配的删除记录（可能已被删除或无权限）",
                    affectedRows: 0,
                };
            }
        } catch (error: any) {
            console.error("移除分类删除记录失败：", error.message, error.stack);
            return {
                code: 403,
                success: false,
                message: `操作失败：${error.message || "数据库执行异常"}`,
                affectedRows: 0,
            };
        }
    }

    async categoryBillList(
        userId: number,
        page?: number,
        pageSize?: number,
        start_time?: string,
        end_time?: string,
        bookId?: number,
        type?: number | null | undefined,
        categoryId?: number | null | undefined
    ): Promise<any> {
        // 复用原工具函数
        const formatAmount = (amount: number): string => amount.toFixed(2);
        const calculateProgress = (current: number, baseMax: number): number => {
            if (baseMax === 0) return 0;
            const progress = (current / baseMax) * 100;
            return Number(Math.min(Math.max(progress, 0), 100).toFixed(1));
        };

        // 新增：星期几转换函数
        const getWeekdayName = (dateStr: string): string => {
            if (!dateStr) return "";
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return "";
            const weekdayMap = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
            return weekdayMap[date.getDay()];
        };

        // 新增：收支类型文本转换
        const getBillTypeText = (type: number): string => {
            switch (type) {
                case 1:
                    return "收入";
                case 2:
                    return "支出";
                default:
                    return "未知";
            }
        };

        try {
            // ========== 1. 基础参数标准化 ==========
            const validPage = Math.max(Number(page) || 1, 1);
            const validPageSize = Math.max(Number(pageSize) || 1000, 1);
            const offset = (validPage - 1) * validPageSize;
            const offsetStr = String(offset);
            const pageSizeStr = String(validPageSize);

            // ========== 2. 时间参数解析（完全复用原逻辑） ==========
            const now = new Date();
            let defaultStart = new Date(1970, 0, 1, 0, 0, 0);
            let defaultEnd = new Date(now.getTime());
            let queryDimension: "year" | "month" | "custom" = "custom";
            let targetYear = now.getFullYear();
            let targetMonth = now.getMonth() + 1;
            let displayStartTime: string = "";
            let displayEndTime: string = "";

            // 时间边界查询（仅用于默认时间范围，不筛选分类/类型）
            const getBillTimeBoundary = async (userId: number, bookId?: number) => {
                let boundaryConditions: string[] = ["b.user_id = ?", "b.is_deleted = 0"];
                let boundaryParams: (number | null)[] = [userId];
                if (bookId !== null && bookId !== undefined && Number(bookId) > 0) {
                    boundaryConditions.push("b.book_id = ?");
                    boundaryParams.push(Number(bookId));
                }
                const [boundaryRows] = await pool.execute(
                    `SELECT IFNULL(MIN(b.bill_time), '1970-01-01 00:00:00') AS min_time,
                            IFNULL(MAX(b.bill_time), NOW())                 AS max_time
                     FROM ${this.billTableName} b
                     WHERE ${boundaryConditions.join(" AND ")}`,
                    boundaryParams
                );
                const minTimeStr = (boundaryRows as any[])[0]?.min_time || "1970-01-01 00:00:00";
                const maxTimeStr = (boundaryRows as any[])[0]?.max_time || new Date().toISOString().slice(0, 19).replace("T", " ");
                return {minTime: new Date(minTimeStr), maxTime: new Date(maxTimeStr)};
            };

            if (!start_time && !end_time) {
                const {minTime, maxTime} = await getBillTimeBoundary(userId, bookId);
                defaultStart = minTime;
                defaultEnd = maxTime;
            }

            const formatTimeByRule = (date: Date, isDateLevel: boolean): string => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, "0");
                if (isDateLevel) {
                    const day = String(date.getDate()).padStart(2, "0");
                    return `${year}-${month}-${day}`;
                }
                return `${year}-${month}`;
            };

            const formatToFullTime = (date: Date): string => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, "0");
                const day = String(date.getDate()).padStart(2, "0");
                const hours = String(date.getHours()).padStart(2, "0");
                const minutes = String(date.getMinutes()).padStart(2, "0");
                const seconds = String(date.getSeconds()).padStart(2, "0");
                return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            };

            const getPeriodTime = (timeStr: string): {
                start: Date;
                end: Date;
                dimension: "year" | "month" | "custom";
                year: number;
                month?: number;
                isDateLevel: boolean;
                originalStr: string;
            } => {
                if (!timeStr) throw new Error("时间字符串不能为空");
                if (/^\d{4}$/.test(timeStr)) {
                    const year = Number(timeStr);
                    return {
                        start: new Date(year, 0, 1, 0, 0, 0),
                        end: new Date(year, 11, 31, 23, 59, 59),
                        dimension: "year",
                        year,
                        isDateLevel: false,
                        originalStr: timeStr,
                    };
                } else if (/^\d{4}-\d{2}$/.test(timeStr)) {
                    const [year, month] = timeStr.split("-").map(Number);
                    return {
                        start: new Date(year, month - 1, 1, 0, 0, 0),
                        end: new Date(year, month, 0, 23, 59, 59),
                        dimension: "month",
                        year,
                        month,
                        isDateLevel: false,
                        originalStr: timeStr,
                    };
                } else if (/^\d{4}-\d{2}-\d{2}$/.test(timeStr)) {
                    const [year, month, day] = timeStr.split("-").map(Number);
                    return {
                        start: new Date(year, month - 1, day, 0, 0, 0),
                        end: new Date(year, month - 1, day, 23, 59, 59),
                        dimension: "custom",
                        year,
                        month,
                        isDateLevel: true,
                        originalStr: timeStr,
                    };
                } else {
                    throw new Error(`时间格式错误：${timeStr}，仅支持 YYYY、YYYY-MM、YYYY-MM-DD`);
                }
            };

            // 确定最终起止时间
            let finalStartTime: string = formatToFullTime(defaultStart);
            let finalEndTime: string = formatToFullTime(defaultEnd);
            let originalStartStr = "";
            let originalEndStr = "";
            let isDateLevelQuery = false;

            if (start_time) {
                const startPeriod = getPeriodTime(start_time);
                originalStartStr = startPeriod.originalStr;
                queryDimension = startPeriod.dimension;
                targetYear = startPeriod.year;
                targetMonth = startPeriod.month || 0;
                isDateLevelQuery = startPeriod.isDateLevel;

                if (end_time) {
                    const endPeriod = getPeriodTime(end_time);
                    originalEndStr = endPeriod.originalStr;
                    if (startPeriod.start > endPeriod.end) throw new Error("开始时间不能晚于结束时间");
                    finalStartTime = formatToFullTime(startPeriod.start);
                    finalEndTime = formatToFullTime(endPeriod.end);
                    isDateLevelQuery = isDateLevelQuery || endPeriod.isDateLevel;
                    queryDimension = "custom";
                    displayStartTime = originalStartStr;
                    displayEndTime = originalEndStr;
                } else {
                    finalStartTime = formatToFullTime(startPeriod.start);
                    finalEndTime = formatToFullTime(startPeriod.end);
                    displayStartTime = originalStartStr;
                    displayEndTime = originalStartStr;
                }
            } else if (end_time) {
                const endPeriod = getPeriodTime(end_time);
                originalEndStr = endPeriod.originalStr;
                finalStartTime = formatToFullTime(defaultStart);
                finalEndTime = formatToFullTime(endPeriod.end);
                isDateLevelQuery = endPeriod.isDateLevel;
                displayStartTime = formatTimeByRule(defaultStart, isDateLevelQuery);
                displayEndTime = originalEndStr;
            } else {
                displayStartTime = formatTimeByRule(defaultStart, true);
                displayEndTime = formatTimeByRule(defaultEnd, true);
            }

            // ========== 3. 构建两类查询条件 ==========
            // 3.1 全量查询条件（仅筛选用户+时间+账本，不筛选分类/类型 → 用于全局汇总）
            let fullWhereConditions: string[] = ["b.user_id = ?", "b.is_deleted = 0"];
            let fullQueryParams: (string | number | null)[] = [userId];
            fullWhereConditions.push("b.bill_time BETWEEN ? AND ?");
            fullQueryParams.push(finalStartTime, finalEndTime);
            if (bookId !== null && bookId !== undefined && Number(bookId) > 0) {
                fullWhereConditions.push("b.book_id = ?");
                fullQueryParams.push(Number(bookId));
            }

            // 3.2 筛选查询条件（全量条件 + 分类/类型筛选 → 用于列表/分页）
            let filterWhereConditions = [...fullWhereConditions];
            let filterQueryParams = [...fullQueryParams];
            // 收支类型筛选
            if (type === 1 || type === 2) {
                filterWhereConditions.push("b.type = ?");
                filterQueryParams.push(type);
            }
            // 分类ID筛选
            if (categoryId !== null && categoryId !== undefined && Number(categoryId) > 0) {
                filterWhereConditions.push("b.category_id = ?");
                filterQueryParams.push(Number(categoryId));
            }

            // ========== 4. 全局全量汇总（固定不变：收入/支出/结余总金额、总笔数） ==========
            const [fullGlobalSummaryRows] = await pool.execute(
                `SELECT IFNULL(SUM(CASE WHEN b.type = 1 THEN b.amount ELSE 0 END), 0) AS global_total_income,
                        IFNULL(SUM(CASE WHEN b.type = 2 THEN b.amount ELSE 0 END), 0) AS global_total_expend,
                        IFNULL(COUNT(CASE WHEN b.type = 1 THEN 1 END), 0)             AS global_total_income_count,
                        IFNULL(COUNT(CASE WHEN b.type = 2 THEN 1 END), 0)             AS global_total_expend_count,
                        IFNULL(COUNT(*), 0)                                           AS global_total_bill_count
                 FROM ${this.billTableName} b
                 WHERE ${fullWhereConditions.join(" AND ")}`,
                fullQueryParams
            );

            const globalSummary = (fullGlobalSummaryRows as any[])[0] || {
                global_total_income: 0,
                global_total_expend: 0,
                global_total_income_count: 0,
                global_total_expend_count: 0,
                global_total_bill_count: 0,
            };
            // 计算全局固定结余
            const globalTotalSurplus = Number((
                Number(globalSummary.global_total_income) - Number(globalSummary.global_total_expend)
            ).toFixed(2));

            // ========== 5. 筛选后分类聚合统计（仅用于列表展示） ==========
            const [categorySummaryRows] = await pool.execute(
                `SELECT b.category_id,
                        c.name                                                        AS category_name,
                        c.icon                                                        AS category_icon,
                        c.type                                                        AS category_type,
                        COUNT(b.id)                                                   AS bill_count,
                        IFNULL(SUM(CASE WHEN b.type = 1 THEN b.amount ELSE 0 END), 0) AS income_amount,
                        IFNULL(SUM(CASE WHEN b.type = 2 THEN b.amount ELSE 0 END), 0) AS expend_amount,
                        IFNULL(SUM(b.amount), 0)                                      AS total_amount
                 FROM ${this.billTableName} b
                          LEFT JOIN mate_category c ON b.category_id = c.id
                 WHERE ${filterWhereConditions.join(" AND ")}
                 GROUP BY b.category_id, c.name, c.icon, c.type
                 ORDER BY bill_count DESC`,
                filterQueryParams
            );

            // ========== 6. 筛选后列表查询（带分页 + 补充时间维度字段） ==========
            const [listRows] = await pool.execute(
                `SELECT b.id,
                        b.user_id,
                        b.amount,
                        b.type,
                        b.currency,
                        DATE_FORMAT(b.bill_time, '%Y-%m-%d %H:%i')                                     AS full_bill_time,
                        DATE_FORMAT(b.bill_time, '%H:%i')                                              AS bill_time,
                        DATE_FORMAT(b.bill_time, '%Y')                                                 AS bill_year,
                        DATE_FORMAT(b.bill_time, '%m')                                                 AS bill_month,
                        DATE_FORMAT(b.bill_time, '%d')                                                 AS bill_day,
                        b.tags,
                        b.remark,
                        DATE_FORMAT(CONVERT_TZ(b.created_at, '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s') AS created_at,
                        DATE_FORMAT(CONVERT_TZ(b.updated_at, '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s') AS updated_at,
                        b.category_id,
                        c.name                                                                         AS category_name,
                        c.icon                                                                         AS category_icon,
                        c.type                                                                         AS category_type,
                        bo.id                                                                          AS book_id,
                        bo.name                                                                        AS book_name,
                        bo.is_default                                                                  AS book_is_default
                 FROM ${this.billTableName} b
                          LEFT JOIN mate_category c ON b.category_id = c.id
                          LEFT JOIN mate_book bo ON b.book_id = bo.id
                 WHERE ${filterWhereConditions.join(" AND ")}
                 ORDER BY b.bill_time DESC LIMIT ?, ?`,
                [...filterQueryParams, offsetStr, pageSizeStr]
            );

            // ========== 7. 筛选后汇总（仅用于进度条计算，不展示） ==========
            const [filterSummaryRows] = await pool.execute(
                `SELECT IFNULL(SUM(CASE WHEN b.type = 1 THEN b.amount ELSE 0 END), 0) AS filter_income,
                        IFNULL(SUM(CASE WHEN b.type = 2 THEN b.amount ELSE 0 END), 0) AS filter_expend
                 FROM ${this.billTableName} b
                 WHERE ${filterWhereConditions.join(" AND ")}`,
                filterQueryParams
            );
            const filterSummary = (filterSummaryRows as any[])[0] || {filter_income: 0, filter_expend: 0};

            // ========== 8. 数据格式化（核心：补充时间维度字段） ==========
            // 8.1 格式化分类聚合数据
            const categoryList = (categorySummaryRows as any[]).map(item => ({
                category_id: Number(item.category_id || 0),
                category_name: item.category_name || "未分类",
                category_icon: item.category_icon || "",
                category_type: Number(item.category_type || 0),
                bill_count: Number(item.bill_count || 0),
                income_amount: Number(item.income_amount || 0),
                expend_amount: Number(item.expend_amount || 0),
                total_amount: Number(item.total_amount || 0),
                surplus_amount: Number((item.income_amount - item.expend_amount).toFixed(2)),
                surplus_direction: (item.income_amount - item.expend_amount) >= 0 ? "盈余" : "赤字",
            }));

            // 8.2 计算进度条基准值
            const allIncomeAmounts = categoryList.map(item => item.income_amount);
            const allExpendAmounts = categoryList.map(item => item.expend_amount);
            const allSurplusAmounts = categoryList.map(item => Math.abs(item.surplus_amount));
            const maxIncome = Math.max(...allIncomeAmounts, 0);
            const maxExpend = Math.max(...allExpendAmounts, 0);
            const maxSurplus = Math.max(...allSurplusAmounts, 0);
            const dynamicBaseMax = Math.max(maxIncome, maxExpend, maxSurplus);

            // 8.3 补充分类进度条 + 账单明细（核心：新增时间维度字段）
            const categoryGroupMap = new Map<number, any>();
            categoryList.forEach(category => {
                categoryGroupMap.set(category.category_id, {
                    category_id: category.category_id,
                    category_name: category.category_name,
                    category_icon: category.category_icon,
                    category_type: category.category_type,
                    bill_count: category.bill_count,
                    income_amount: formatAmount(category.income_amount),
                    expend_amount: formatAmount(category.expend_amount),
                    surplus_amount: formatAmount(category.surplus_amount),
                    surplus_direction: category.surplus_direction,
                    income_progress: calculateProgress(category.income_amount, maxIncome),
                    expend_progress: calculateProgress(category.expend_amount, maxExpend),
                    surplus_progress: calculateProgress(Math.abs(category.surplus_amount), maxSurplus),
                    list: [],
                });
            });

            // 8.4 格式化账单明细（补充收支类型、年/月/日、星期几）
            let currentPageIncome = 0;
            let currentPageExpend = 0;
            let currentPageIncomeCount = 0;
            let currentPageExpendCount = 0;

            (listRows as any[]).forEach(item => {
                const amount = Number(item.amount || 0);
                const categoryId = Number(item.category_id || 0);
                const billType = Number(item.type || 0);
                const fullBillTime = item.full_bill_time || "";

                // 构建时间维度字段
                const timeInfo = {
                    year: item.bill_year || "",          // 年（如：2025）
                    month: item.bill_month || "",        // 月（如：11）
                    day: item.bill_day || "",            // 日（如：17）
                    monthText: item.bill_month ? `${item.bill_month}月` : "", // 月文本（如：11月）
                    yearText: item.bill_year ? `${item.bill_year}年` : "",     // 年文本（如：2025年）
                    weekday: getWeekdayName(fullBillTime), // 星期几（如：周一）
                    billTypeText: getBillTypeText(billType), // 收支类型（收入/支出）
                    fullBillTime: fullBillTime,          // 完整时间（2025-11-17 11:30:00）
                    shortTime: item.bill_time || ""      // 时分（11:30）
                };

                const billItem = {
                    id: item.id || 0,
                    user_id: item.user_id || 0,
                    amount: formatAmount(amount),
                    type: billType,
                    typeText: timeInfo.billTypeText, // 收支类型文本（收入/支出）
                    currency: item.currency || "",
                    // 时间维度字段（核心新增）
                    full_bill_time: timeInfo.fullBillTime,
                    bill_year: timeInfo.year,
                    bill_month: timeInfo.month,
                    bill_day: timeInfo.day,
                    bill_month_text: timeInfo.monthText,
                    bill_year_text: timeInfo.yearText,
                    bill_weekday: timeInfo.weekday,
                    bill_time: timeInfo.shortTime,
                    // 原有字段
                    remark: item.remark || "",
                    tags: (() => {
                        try {
                            return JSON.parse(item.tags || "[]");
                        } catch {
                            return [];
                        }
                    })(),
                    created_at: item.created_at || "",
                    updated_at: item.updated_at || "",
                    single_progress: calculateProgress(amount, dynamicBaseMax),
                    category: {
                        id: categoryId,
                        name: item.category_name || "未分类",
                        icon: item.category_icon || "",
                        type: item.category_type || 0,
                    },
                    book: {
                        id: item.book_id || 0,
                        name: item.book_name || "默认账本",
                        is_default: item.book_is_default || 0,
                    },
                    // 兼容原有下划线格式
                    _year: timeInfo.year,
                    _month: timeInfo.month,
                    _day: timeInfo.day,
                };

                if (billType === 1) {
                    currentPageIncome += amount;
                    currentPageIncomeCount++;
                } else if (billType === 2) {
                    currentPageExpend += amount;
                    currentPageExpendCount++;
                }

                if (categoryGroupMap.has(categoryId)) {
                    categoryGroupMap.get(categoryId).list.push(billItem);
                } else {
                    if (!categoryGroupMap.has(0)) {
                        categoryGroupMap.set(0, {
                            category_id: 0,
                            category_name: "未分类",
                            category_icon: "",
                            category_type: 0,
                            bill_count: 0,
                            income_amount: "0.00",
                            expend_amount: "0.00",
                            surplus_amount: "0.00",
                            surplus_direction: "盈余",
                            income_progress: 0,
                            expend_progress: 0,
                            surplus_progress: 0,
                            list: [],
                        });
                    }
                    categoryGroupMap.get(0).list.push(billItem);
                    categoryGroupMap.get(0).bill_count = categoryGroupMap.get(0).list.length;
                }
            });

            // ========== 9. 分页处理 ==========
            const [countRows] = await pool.execute(
                `SELECT COUNT(*) AS total
                 FROM ${this.billTableName} b
                 WHERE ${filterWhereConditions.join(" AND ")}`,
                filterQueryParams
            );
            const filterTotal = Number((countRows as any[])[0]?.total || 0);
            const totalPage = Math.ceil(filterTotal / validPageSize);

            const formattedCategoryList = Array.from(categoryGroupMap.values())
                .sort((a, b) => {
                    if (a.bill_count !== b.bill_count) return b.bill_count - a.bill_count;
                    return a.category_name.localeCompare(b.category_name);
                })
                .map(category => ({
                    ...category,
                    // @ts-ignore
                    list: category.list.map(bill => ({...bill, status: true})),
                }));

            // ========== 10. 进度计算（仅用于列表进度条） ==========
            const filterIncome = Number(filterSummary.filter_income);
            const filterExpend = Number(filterSummary.filter_expend);
            const filterSurplus = Number((filterIncome - filterExpend).toFixed(2));
            const currentPageSurplus = Number((currentPageIncome - currentPageExpend).toFixed(2));

            const incomeProgress = calculateProgress(filterIncome, dynamicBaseMax);
            const expendProgress = calculateProgress(filterExpend, dynamicBaseMax);
            const surplusProgress = calculateProgress(Math.abs(filterSurplus), dynamicBaseMax);
            const currentPageSurplusProgress = calculateProgress(Math.abs(currentPageSurplus), dynamicBaseMax);

            // ========== 11. 返回结果（全局汇总固定，列表数据筛选） ==========
            return {
                code: 200,
                list: {
                    ...(queryDimension === "custom" ? {
                        timeRange: {start: displayStartTime, end: displayEndTime},
                    } : {
                        year: targetYear,
                        ...(queryDimension === "month" ? {month: targetMonth} : {}),
                    }),
                    listType: "category",
                    dataList: formattedCategoryList.length > 0 ? formattedCategoryList : [],
                },
                summary: {
                    // ========== 核心：固定不变的全局汇总 ==========
                    totalIncome: formatAmount(Number(globalSummary.global_total_income)), // 收入总金额（固定）
                    totalExpend: formatAmount(Number(globalSummary.global_total_expend)), // 支出总金额（固定）
                    totalSurplus: formatAmount(globalTotalSurplus), // 结余总金额（固定）
                    totalIncomeCount: Number(globalSummary.global_total_income_count), // 收入总笔数（固定）
                    totalExpendCount: Number(globalSummary.global_total_expend_count), // 支出总笔数（固定）
                    totalBillCount: Number(globalSummary.global_total_bill_count), // 总笔数（固定）

                    // ========== 筛选后的列表数据（仅用于展示，不影响全局） ==========
                    listIncome: formatAmount(filterIncome), // 筛选后收入
                    listExpend: formatAmount(filterExpend), // 筛选后支出
                    listSurplus: formatAmount(filterSurplus), // 筛选后结余
                    currentPageIncome: formatAmount(currentPageIncome), // 当前页收入
                    currentPageExpend: formatAmount(currentPageExpend), // 当前页支出
                    currentPageSurplus: formatAmount(currentPageSurplus), // 当前页结余
                    listIncomeCount: filterTotal > 0 ? (type === 1 ? filterTotal : (type === 2 ? 0 : currentPageIncomeCount)) : 0,
                    listExpendCount: filterTotal > 0 ? (type === 2 ? filterTotal : (type === 1 ? 0 : currentPageExpendCount)) : 0,
                    listTotalCount: filterTotal, // 筛选后总笔数
                    currentPageIncomeCount: currentPageIncomeCount, // 当前页收入笔数
                    currentPageExpendCount: currentPageExpendCount, // 当前页支出笔数
                    currentPageTotalCount: currentPageIncomeCount + currentPageExpendCount, // 当前页总笔数

                    // ========== 原有公共字段 ==========
                    year: null,
                    month: null,
                    start_year: new Date(finalStartTime).getFullYear(),
                    start_month: new Date(finalStartTime).getMonth() + 1,
                    end_year: new Date(finalEndTime).getFullYear(),
                    end_month: new Date(finalEndTime).getMonth() + 1,
                    queryDimension: queryDimension,
                    surplusDirection: globalTotalSurplus >= 0 ? "盈余" : "赤字", // 全局结余方向（固定）
                    currentPageSurplusProgress: currentPageSurplusProgress,
                    incomeProgress: incomeProgress,
                    expendProgress: expendProgress,
                    surplusProgress: surplusProgress,
                    start_time: displayStartTime,
                    end_time: displayEndTime,
                    progressDesc: `进度基准：分类${dynamicBaseMax === maxIncome ? "收入" : dynamicBaseMax === maxExpend ? "支出" : "盈余"}最大值(${dynamicBaseMax.toFixed(2)})=100%`,
                    filterType: type === undefined || type === null ? "all" : type,
                    filterCategoryId: categoryId !== null && categoryId !== undefined ? Number(categoryId) : "all",
                    emptyTip: filterTotal === 0 ? "当前筛选条件下无分类账单数据" : "",
                },
                pagination: {
                    total: filterTotal, // 筛选后总条数
                    page: validPage,
                    pageSize: validPageSize,
                    totalPage: totalPage,
                },
            };
        } catch (error: any) {
            console.error("查询分类账单列表失败：", error.message, error.stack);
            const now = new Date();
            const defaultYear = now.getFullYear();
            const defaultMonth = now.getMonth() + 1;
            const formatTimeByRule = (date: Date, isDateLevel: boolean): string => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, "0");
                if (isDateLevel) {
                    const day = String(date.getDate()).padStart(2, "0");
                    return `${year}-${month}-${day}`;
                }
                return `${year}-${month}`;
            };
            const displayStartTime = formatTimeByRule(new Date(1970, 0, 1), false);
            const displayEndTime = formatTimeByRule(now, false);

            return {
                code: 500,
                message: error.message || "查询分类账单列表失败",
                list: {
                    timeRange: {start: displayStartTime, end: displayEndTime},
                    listType: "category",
                    dataList: [],
                },
                summary: {
                    // 异常场景全局汇总固定为0
                    totalIncome: "0.00",
                    totalExpend: "0.00",
                    totalSurplus: "0.00",
                    totalIncomeCount: 0,
                    totalExpendCount: 0,
                    totalBillCount: 0,
                    // 筛选后数据兜底
                    listIncome: "0.00",
                    listExpend: "0.00",
                    listSurplus: "0.00",
                    currentPageIncome: "0.00",
                    currentPageExpend: "0.00",
                    currentPageSurplus: "0.00",
                    listIncomeCount: 0,
                    listExpendCount: 0,
                    listTotalCount: 0,
                    currentPageIncomeCount: 0,
                    currentPageExpendCount: 0,
                    currentPageTotalCount: 0,
                    year: defaultYear,
                    month: defaultMonth,
                    start_year: defaultYear,
                    start_month: defaultMonth,
                    end_year: defaultYear,
                    end_month: defaultMonth,
                    queryDimension: "custom",
                    surplusDirection: "盈余",
                    currentPageSurplusProgress: 0,
                    incomeProgress: 0,
                    expendProgress: 0,
                    surplusProgress: 0,
                    start_time: displayStartTime,
                    end_time: displayEndTime,
                    progressDesc: "",
                    filterType: type === undefined || type === null ? "all" : type,
                    filterCategoryId: categoryId !== null && categoryId !== undefined ? Number(categoryId) : "all",
                    emptyTip: "查询异常，暂无数据",
                },
                pagination: {
                    total: 0,
                    page: Math.max(Number(page) || 1, 1),
                    pageSize: Math.max(Number(pageSize) || 10, 1),
                    totalPage: 0,
                },
            };
        }
    }


    /**
     * 更新分类排序（拖拽排序核心方法）
     * @param userId 操作用户ID
     * @param bookId 账本ID
     * @param categoryId 被排序的分类ID
     * @param sortOrder 新的排序值
     * @returns 操作结果
     */
    async categorySort(
        userId: number,
        bookId: number,
        categoryId: number,
        sortOrder: number
    ): Promise<{ success: boolean; message: string }> {
        // 步骤1：参数合法性校验
        const validUserId = Number(userId);
        const validBookId = Number(bookId);
        const validCategoryId = Number(categoryId);
        const validSortOrder = Number(sortOrder);

        if (!validUserId || validUserId <= 0) {
            return {success: false, message: "用户ID不能为空且必须为正整数"};
        }
        if (!validBookId || validBookId <= 0) {
            return {success: false, message: "账本ID不能为空且必须为正整数"};
        }
        if (!validCategoryId || validCategoryId <= 0) {
            return {success: false, message: "分类ID不能为空且必须为正整数"};
        }
        if (isNaN(validSortOrder)) {
            return {success: false, message: "排序值必须为有效数字"};
        }

        try {
            // 步骤2：校验分类是否存在且可用
            const [categoryExist] = await pool.execute<RowDataPacket[]>(
                `SELECT id, is_active
                 FROM ${this.categoryTableName}
                 WHERE id = ?
                   AND is_deleted = 0`,
                [validCategoryId]
            );
            const category = categoryExist[0];
            if (!category) {
                return {success: false, message: "分类不存在或已被删除"};
            }
            if (category.is_active !== 1) {
                return {success: false, message: "分类已禁用，无法修改排序"};
            }

            // 步骤3：查询当前用户-账本-分类的排序记录（用于乐观锁）
            const [sortExist] = await pool.execute<RowDataPacket[]>(
                `SELECT id, version
                 FROM mate_category_user_sort
                 WHERE user_id = ?
                   AND book_id = ?
                   AND category_id = ?`,
                [validUserId, validBookId, validCategoryId]
            );
            const sortRecord = sortExist[0];

            let affectRows = 0;
            if (sortRecord) {
                // 步骤4：已有记录，乐观锁更新（防止并发覆盖）
                const newVersion = sortRecord.version + 1;
                const [updateResult] = await pool.execute<OkPacket>(
                    `UPDATE mate_category_user_sort
                     SET sort_order = ?,
                         version = ?,
                         updated_at = NOW()
                     WHERE id = ?
                       AND version = ?`,
                    [validSortOrder, newVersion, sortRecord.id, sortRecord.version]
                );
                // 从 OkPacket 中提取受影响行数
                affectRows = updateResult.affectedRows;

                // 乐观锁冲突：更新行数为0，说明并发修改
                if (affectRows === 0) {
                    return {success: false, message: "排序更新失败，可能已被其他操作修改，请重试"};
                }
            } else {
                // 步骤5：无记录，插入新的自定义排序
                const [insertResult] = await pool.execute<OkPacket>(
                    `INSERT INTO mate_category_user_sort
                     (user_id, book_id, category_id, sort_order, version, created_at, updated_at)
                     VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
                    [validUserId, validBookId, validCategoryId, validSortOrder]
                );
                // 从 OkPacket 中提取受影响行数
                affectRows = insertResult.affectedRows;
            }

            // 步骤6：判断操作结果
            if (affectRows > 0) {
                return {success: true, message: "分类排序更新成功"};
            } else {
                return {success: false, message: "分类排序更新失败，请重试"};
            }
        } catch (error: any) {
            console.error("分类排序更新异常：", error.message, error.stack);
            return {
                success: false,
                message: `排序更新失败：${error.message || "数据库操作异常"}`,
            };
        }
    }
}

export default new UserModule();
