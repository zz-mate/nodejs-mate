import pool from "../../db";
import {v4 as uuidv4} from "uuid"; // 核心导入语句
import type {BookDbSchema, PaginationData} from "../../types";
import HttpError from "../../utils/HttpError";

class UserModule {
    bookTableName = "mate_book";
    userTableName = "mate_user";
    billTableName = "mate_bill";

    /**
     * 创建账本
     * @param userId 创建人ID
     * @param bookCategoryId 账本分类ID
     * @param icon 账本icon
     * @param name 账本名称
     * @param description 账本描述
     * @returns 包含状态码和账本数据的对象
     */
    async createBook(
        userId: number,
        bookCategoryId: number,
        icon: string,
        name: string,
        description: string
    ): Promise<{
        code: number;
        data: BookDbSchema | null;
        message?: string;
    }> {
        // 1. 入参校验
        if (!userId || !bookCategoryId || !name) {
            return {
                code: 400,
                data: null,
                message: "用户ID、分类ID和账本名称为必填项",
            };
        }

        // 名称长度限制（根据数据库字段长度调整，示例为100）
        if (name.length > 100) {
            return {
                code: 400,
                data: null,
                message: "账本名称长度不能超过100个字符",
            };
        }

        try {
            // 2. 校验账本名称是否重复（两种场景可选其一）
            // 场景1：同一用户下名称唯一（推荐，不同用户可重名）
            const [nameCheckRows] = await pool.execute(
                `SELECT id
                 FROM ${this.bookTableName}
                 WHERE name = ?
                   AND user_id = ? LIMIT 1`,
                [name, userId]
            );

            // 场景2：全局名称唯一（所有用户不可重名）
            // const [nameCheckRows] = await this.pool.execute(
            //   `SELECT id FROM ${this.bookTableName} WHERE name = ? AND is_deleted = 0 LIMIT 1`,
            //   [name]
            // );

            // 若查询到结果，说明名称重复
            if ((nameCheckRows as BookDbSchema[]).length > 0) {
                return {
                    code: 403,
                    data: null,
                    message: `账本名称「${name}」已存在，请勿重复创建`,
                };
            }

            let uuid = uuidv4();
            // 2. 执行插入SQL
            const [insertResult] = await pool.execute(
                `INSERT INTO ${this.bookTableName}
                 (uuid, user_id, book_category_id, icon, name, description, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                [uuid, userId, bookCategoryId, icon, name, description || ""] // 描述为空时填充空字符串
            );

            // 3. 获取插入后的账本完整信息
            const [rows] = await pool.execute(
                `SELECT *
                 FROM ${this.bookTableName}
                 WHERE id = ? LIMIT 1`,
                [(insertResult as any).insertId] // 获取自增ID
            );

            const newBook = (rows as BookDbSchema[])[0];

            // 4. 返回成功结果
            return {
                code: 200,
                data: newBook,
            };
        } catch (error) {
            console.error("创建账本失败:", error);

            // 处理重复键错误（如账本名称唯一约束）
            if ((error as any).code === "ER_DUP_ENTRY") {
                return {
                    code: 409,
                    data: null,
                    message: "账本名称已存在，无法重复创建",
                };
            }

            // 通用服务器错误
            return {
                code: 500,
                data: null,
                message: "创建账本失败，请稍后重试",
            };
        }
    }

    /**
     * 更新账本信息（修复is_default不更新问题）
     * @param userId 操作人ID（用于权限校验）
     * @param bookId 账本ID
     * @param updateData 要更新的字段（可选）
     * @returns 包含状态码和账本数据的对象
     */
    async updateBook(
        userId: number,
        bookId: number,
        updateData: {
            bookCategoryId?: number;
            icon?: string;
            name?: string;
            description?: string;
            is_default?: number; // 1=设为默认，0=取消默认，不传则不修改
        }
    ): Promise<{ code: number; data: BookDbSchema | null; message?: string }> {
        // 1. 基础入参校验
        if (!userId || !bookId) {
            return {
                code: 400,
                data: null,
                message: "用户ID和账本ID为必填项",
            };
        }

        // 名称长度校验
        if (updateData.name && updateData.name.length > 100) {
            return {
                code: 400,
                data: null,
                message: "账本名称长度不能超过100个字符",
            };
        }

        // is_default 取值校验（仅允许 0/1）
        if (
            updateData.is_default !== undefined &&
            ![0, 1].includes(updateData.is_default)
        ) {
            return {
                code: 400,
                data: null,
                message: "is_default仅支持传入0或1",
            };
        }

        // 开启事务
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // 2. 校验账本归属
            const [bookCheckRows] = await connection.execute(
                `SELECT id, name
                 FROM ${this.bookTableName}
                 WHERE id = ?
                   AND user_id = ? LIMIT 1`,
                [bookId, userId]
            );
            const targetBook = (bookCheckRows as BookDbSchema[])[0];
            if (!targetBook) {
                await connection.rollback();
                return {code: 404, data: null, message: "账本不存在或无操作权限"};
            }

            // 3. 名称重复校验
            if (updateData.name) {
                const [nameCheckRows] = await connection.execute(
                    `SELECT id
                     FROM ${this.bookTableName}
                     WHERE name = ?
                       AND user_id = ?
                       AND id != ? LIMIT 1`,
                    [updateData.name, userId, bookId]
                );
                if ((nameCheckRows as BookDbSchema[]).length > 0) {
                    await connection.rollback();
                    return {
                        code: 403,
                        data: null,
                        message: `账本名称「${updateData.name}」已存在`,
                    };
                }
            }

            // 4. 处理默认账本逻辑（置空当前用户所有默认）
            let needUpdateDefault = false;
            if (updateData.is_default === 1) {
                needUpdateDefault = true;
                // 将当前用户下所有账本的is_default置为0
                await connection.execute(
                    `UPDATE ${this.bookTableName}
                     SET is_default = 0,
                         updated_at = NOW()
                     WHERE user_id = ?`,
                    [userId]
                );
            }

            // 5. 动态构建更新字段（核心修复：确保is_default被加入）
            const updateFields: string[] = [];
            const updateParams: any[] = [];

            // 逐个判断字段，包括is_default
            if (updateData.bookCategoryId !== undefined) {
                updateFields.push("book_category_id = ?");
                updateParams.push(updateData.bookCategoryId);
            }
            if (updateData.icon !== undefined) {
                updateFields.push("icon = ?");
                updateParams.push(updateData.icon);
            }
            if (updateData.name !== undefined) {
                updateFields.push("name = ?");
                updateParams.push(updateData.name);
            }
            if (updateData.description !== undefined) {
                updateFields.push("description = ?");
                updateParams.push(updateData.description || "");
            }
            // 【核心修复】明确加入is_default字段的更新逻辑
            if (updateData.is_default !== undefined) {
                updateFields.push("is_default = ?");
                updateParams.push(updateData.is_default);
            }
            // 无更新字段时返回错误
            if (updateFields.length === 0) {
                await connection.rollback();
                return {code: 400, data: null, message: "请传入至少一个要更新的字段"};
            }

            // 增加更新时间
            updateFields.push("updated_at = NOW()");
            // 补充WHERE条件参数
            updateParams.push(bookId, userId);

            // 6. 执行更新（包含is_default）
            const [updateResult] = await connection.execute(
                `UPDATE ${this.bookTableName}
                 SET ${updateFields.join(", ")}
                 WHERE id = ?
                   AND user_id = ?`,
                updateParams
            );
            await connection.execute(
                `UPDATE ${this.userTableName}
                 SET default_book_id = ?
                 WHERE id = ?`,
                [bookId, userId]
            );
            if ((updateResult as any).affectedRows === 0) {
                await connection.rollback();
                return {
                    code: 500,
                    data: null,
                    message: "账本更新失败，未修改任何数据",
                };
            }

            // 提交事务
            await connection.commit();

            // 7. 查询更新后的完整数据（验证is_default是否生效）
            const [rows] = await pool.execute(
                `SELECT *
                 FROM ${this.bookTableName}
                 WHERE id = ? LIMIT 1`,
                [bookId]
            );
            const updatedBook = (rows as BookDbSchema[])[0];

            return {code: 200, data: updatedBook};
        } catch (error) {
            await connection.rollback();
            console.error("更新账本失败:", error);
            if ((error as any).code === "ER_DUP_ENTRY") {
                return {code: 409, data: null, message: "账本名称已存在，无法更新"};
            }
            return {code: 500, data: null, message: "更新账本失败，请稍后重试"};
        } finally {
            connection.release();
        }
    }

    // 账本是否存在
    async findById(bookId: number, userId: number): Promise<BookDbSchema | null> {
        const [rows] = await pool.execute(
            `SELECT id
             FROM ${this.bookTableName}
             WHERE id = ?
               AND user_id = ? LIMIT 1`,
            [bookId, userId]
        );
        const book = (rows as BookDbSchema[])[0];
        return book || null;
    }

    // 账本详情
    async bookInfo(
        userId: number,
        bookId: number
    ): Promise<{ code: number; data: BookDbSchema }> {
        const [rows] = await pool.execute(
            `SELECT *
             FROM ${this.bookTableName}
             WHERE id = ?
               AND user_id = ? LIMIT 1`,
            [bookId, userId]
        );
        const book = (rows as BookDbSchema[])[0];

        return {
            code: 200,
            data: book,
        };
    }

    /**
     * 查询用户账本列表（分页）- 拆分单人/多人记账账本
     * @param userId 用户ID（必填）
     * @param page 当前页码（默认1）
     * @param pageSize 每页条数（默认10）
     * @returns 分页结果（单人账本数组 + 多人账本数组 + 总分页信息）
     */
    async bookList(
        userId: number,
        page: number = 1,
        pageSize: number = 10
    ): Promise<any> {
        try {
            // 1. 参数校验 & 兜底（避免非数值/负数）
            const validUserId = Number(userId);
            if (!validUserId || isNaN(validUserId) || validUserId <= 0) {
                throw new HttpError("用户ID必须为有效正整数", 400);
            }
            const validPage = Math.max(Number(page) || 1, 1); // 页码最小为1
            const validPageSize = Math.max(Number(pageSize) || 10, 1); // 每页条数最小为1
            const offset = (validPage - 1) * validPageSize; // 计算偏移量

            // 2. 查询分页数据（全量账本：创建+协作）
            const [listRows] = await pool.execute(
                `SELECT DISTINCT b.id,
                                 b.user_id                                      AS book_owner_id, -- 账本创建者ID
                                 b.name,
                                 b.icon,
                                 b.book_category_id,
                                 b.is_default,
                                 -- 原始创建时间（用于排序，前端不返回）
                                 b.created_at                                   AS raw_created_at,
                                 DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                                 DATE_FORMAT(b.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
                                 -- 子查询统计账单数
                                 (SELECT IFNULL(COUNT(id), 0)
                                  FROM mate_bill
                                  WHERE book_id = b.id
                                    AND (is_deleted IS NULL OR is_deleted = 0)) AS bill_count,
                                 -- 复用子查询：统计协作成员数
                                 @member_count := (SELECT IFNULL(COUNT(DISTINCT user_id), 0) FROM mate_book_user_relation WHERE book_id = b.id AND is_active = 1 AND user_id != b.user_id) AS member_count,
                    -- 总协作用户数 = 所有者1人 + 协作成员数
                    1 + @member_count AS user_count,
                    -- 多人记账标识：总人数>1则为1
                    CASE WHEN (1 + @member_count) > 1 THEN 1 ELSE 0
                END
                AS is_multi_user,
                    -- 当前用户的协作角色
                    CASE
                        WHEN b.user_id = ? THEN 1 -- 所有者
                        ELSE (SELECT IFNULL(role, 0) FROM mate_book_user_relation WHERE book_id = b.id AND user_id = ? AND is_active = 1)
                END
                AS user_role
             FROM
                ${this.bookTableName}
                b
                -- 筛选：创建的账本 OR 协作的账本
                WHERE
                (
                b
                .
                user_id
                =
                ?
                OR
                b
                .
                id
                IN
                (
                SELECT
                book_id
                FROM
                mate_book_user_relation
                WHERE
                user_id
                =
                ?
                AND
                is_active
                =
                1
                )
                )
                AND
                (
                b
                .
                is_deleted
                IS
                NULL
                OR
                b
                .
                is_deleted
                =
                0
                )
                -- 使用SELECT列表中的raw_created_at排序
                ORDER
                BY
                raw_created_at
                DESC
                LIMIT
                ?,
                ?`,
                // 参数顺序：所有者判断 + 角色查询 + 创建者筛选 + 协作筛选 + offset + pageSize
                [validUserId, validUserId, validUserId, validUserId, offset + '', validPageSize + '']
            );

            // 3. 查询总条数（全量数据的总条数，用于分页）
            const [countRows] = await pool.execute(
                `SELECT COUNT(DISTINCT b.id) AS total
                 FROM ${this.bookTableName} b
                 WHERE (b.user_id = ? OR
                        b.id IN (SELECT book_id FROM mate_book_user_relation WHERE user_id = ? AND is_active = 1))
                   AND (b.is_deleted IS NULL OR b.is_deleted = 0)`,
                [validUserId, validUserId]
            );
            const total = Number((countRows as any)[0]?.total || 0);
            const totalPage = Math.ceil(total / validPageSize); // 总页数（向上取整）

            // 4. 数据格式化 + 拆分单人/多人账本数组
            const formattedData = (listRows as any[]).map(item => {
                // 剔除临时字段，保留业务字段
                const {raw_created_at, member_count, ...rest} = item;
                return {
                    ...rest,
                    user_role_name: item.user_role === 1 ? '所有者' : item.user_role === 2 ? '普通成员' : item.user_role === 3 ? '只读成员' : '无权限',
                    is_multi_user_name: item.is_multi_user === 1 ? '多人记账' : '单人记账'
                };
            });

            // 核心：拆分单人/多人账本数组
            const singleBookList = formattedData.filter(item => item.is_multi_user === 0); // 单人记账（is_multi_user=0）
            const multiBookList = formattedData.filter(item => item.is_multi_user === 1);  // 多人记账（is_multi_user=1）

            // 5. 返回结果（拆分后的数组 + 全量分页信息）
            return {
                code: 200,
                data: {
                    singleBookList, // 单人记账账本数组
                    multiBookList,  // 多人记账账本数组
                    // 分页信息：基于全量数据（单人+多人）
                    pagination: {
                        total,         // 全量账本总数
                        page: validPage, // 当前页码
                        pageSize: validPageSize, // 每页条数
                        totalPage,     // 全量总页数
                        // 可选：返回当前页单人/多人的数量
                        currentSingleCount: singleBookList.length,
                        currentMultiCount: multiBookList.length
                    }
                },
                message: "查询成功"
            };
        } catch (error: any) {
            console.error("查询账本分页列表失败：", error.message);
            throw new HttpError(`查询账本列表失败：${error.message}`, 500);
        }
    }

    /**
     * 查询指定账本下的协作用户列表（分页）
     * @param userId 当前操作用户ID（用于权限校验）
     * @param bookId 账本ID（必填）
     * @param page 当前页码（默认1）
     * @param pageSize 每页条数（默认10）
     * @returns 分页结果（用户列表 + 总条数 + 分页信息）
     */
    async bookUserList(
        userId: number,
        bookId: number | string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<any> {
        try {
            // 1. 严格参数校验
            const validUserId = Number(userId);
            const validBookId = Number(bookId);
            if (!validUserId || isNaN(validUserId) || validUserId <= 0) {
                throw new HttpError("用户ID必须为有效正整数", 400);
            }
            if (!validBookId || isNaN(validBookId) || validBookId <= 0) {
                throw new HttpError("账本ID必须为有效正整数", 400);
            }
            const validPage = Math.max(Number(page) || 1, 1);
            const validPageSize = Math.max(Number(pageSize) || 10, 1);
            const offset = (validPage - 1) * validPageSize;

            // 2. 权限校验：确保当前用户是账本所有者/已接受邀请的协作者
            // 先查询账本基础信息（获取所有者ID）
            const [bookInfo] = await pool.execute(
                `SELECT id, user_id AS owner_id
                 FROM ${this.bookTableName}
                 WHERE id = ?
                   AND (is_deleted IS NULL OR is_deleted = 0)`,
                [validBookId]
            );
            if ((bookInfo as any[]).length === 0) {
                throw new HttpError("账本不存在或已删除", 404);
            }
            const bookOwnerId = (bookInfo as any[])[0].owner_id; // 账本所有者ID

            // 权限校验：当前用户是所有者 或 已在关联表中（接受邀请）
            const [authCheck] = await pool.execute(
                `SELECT 1
                 FROM mate_book_user_relation
                 WHERE book_id = ?
                   AND user_id = ?
                   AND is_active = 1
                 UNION ALL
                 SELECT 1
                 FROM ${this.bookTableName}
                 WHERE id = ?
                   AND user_id = ?`,
                [validBookId, validUserId, validBookId, validUserId]
            );
            if ((authCheck as any[]).length === 0) {
                throw new HttpError("无权限查看该账本的用户列表", 403); // 注意：HTTP 403 是标准的无权限码，不要用200
            }

            // 3. 核心查询：默认包含所有者 + 已接受邀请的协作者
            // 逻辑：先查所有者（角色1），再查关联表中的协作者（角色2/3），合并后分页
            const [listRows] = await pool.execute(
                `SELECT
                     -- 统一字段结构：所有者的relation_id为0（标识默认所有者）
                     IF(t.type = 'owner', 0, t.relation_id)          AS relation_id,
                     ?                                               AS book_id,
                     t.user_id,
                     t.role,
                     1                                               AS is_active, -- 所有者默认有效，协作者已过滤is_active=1
                     DATE_FORMAT(t.join_time, '%Y-%m-%d %H:%i:%s')   AS join_book_time,
                     -- 用户核心信息
                     mu.id                                           AS user_id,
                     mu.username,
                     mu.nickname,
                     mu.avatar,
                     mu.phone,
                     mu.email,
                     mu.is_active                                    AS user_status,
                     DATE_FORMAT(mu.created_at, '%Y-%m-%d %H:%i:%s') AS user_create_time
                 FROM (
                          -- 子查询1：账本所有者（默认加入，角色1）
                          SELECT 'owner'        AS type,
                                 ${bookOwnerId} AS user_id,
                                 1              AS role,
                                 b.created_at   AS join_time,
                                 NULL           AS relation_id
                          FROM ${this.bookTableName} b
                          WHERE b.id = ?
                          UNION ALL
                          -- 子查询2：已接受邀请的协作者（关联表中的记录）
                          SELECT 'member'       AS type,
                                 bur.user_id,
                                 bur.role,
                                 bur.created_at AS join_time,
                                 bur.id         AS relation_id
                          FROM mate_book_user_relation bur
                          WHERE bur.book_id = ?
                            AND bur.is_active = 1
                            AND bur.user_id != ? -- 排除重复的所有者
                      ) t
                          LEFT JOIN mate_user mu ON t.user_id = mu.id
                 ORDER BY t.is_default DESC ,t.role ASC, t.join_time DESC LIMIT ?, ?`,
                [validBookId, validBookId, validBookId, bookOwnerId, String(offset), String(validPageSize)] // 注意：参数顺序和SQL中的?对应
            );

            // 4. 查询总条数（所有者+协作者总数）
            const [countRows] = await pool.execute(
                `SELECT COUNT(*) AS total
                 FROM (SELECT 1
                       FROM ${this.bookTableName}
                       WHERE id = ?
                       UNION ALL
                       SELECT 1
                       FROM mate_book_user_relation
                       WHERE book_id = ?
                         AND is_active = 1
                         AND user_id != ?) t`,
                [validBookId, validBookId, bookOwnerId]
            );
            const total = Number((countRows as any)[0]?.total || 0);
            const totalPage = Math.ceil(total / validPageSize);

            // 5. 数据格式化
            const formattedList = (listRows as any[]).map(item => ({
                ...item,
                role_name: item.role === 1 ? '所有者' : item.role === 2 ? '普通成员' : '只读成员',
                user_status_name: item.user_status === 1 ? '正常' : '禁用'
            }));

            // 6. 返回结果
            return {
                code: 200,
                message: "查询成功",
                list: formattedList,
                pagination: {
                    total,
                    page: validPage,
                    pageSize: validPageSize,
                    totalPage
                }
            };
        } catch (error: any) {
            console.error(`查询账本[${bookId}]用户列表失败：`, error.message);
            if (error instanceof HttpError) {
                throw error;
            }
            throw new HttpError(`查询账本用户列表失败：${error.message}`, 500);
        }
    }

    /**
     * 分享账本（创建待接受邀请）
     * @param shareUserId 分享者ID（账本所有者）
     * @param shareBookId 账本ID
     * @param inviteeId 被邀请人ID
     * @param role 协作角色：2-普通成员 3-只读成员（默认2）
     */
    async shareBook(shareUserId: number, shareBookId: number, role: number = 2) {
        // 1. 参数校验（同joinBook）
        const validShareUserId = Number(shareUserId);
        const validShareBookId = Number(shareBookId);
        if (!validShareUserId || !validShareBookId) {
            throw new HttpError("参数错误", 400);
        }

        // 2. 校验分享者是账本所有者
        const [bookInfo] = await pool.execute(
            `SELECT id
             FROM ${this.bookTableName}
             WHERE id = ?
               AND user_id = ?`,
            [validShareBookId, validShareUserId]
        );
        if ((bookInfo as any[]).length === 0) {
            throw new HttpError("只有账本所有者才能分享", 403);
        }

        // 3. 写入待接受邀请（is_active=0）
        await pool.execute(
            `INSERT INTO mate_book_user_relation
                 (book_id, user_id, role, is_active, created_at)
             VALUES (?, ?, ?, 0, NOW()) ON DUPLICATE KEY
            UPDATE
                role = ?,
                is_active = 0,
                updated_at = NOW()`, // 重复邀请时重置为待接受状态
            [validShareBookId, role, role]
        );

        return {code: 200, message: "邀请已发送，等待对方加入"};
    }

    /**
     * 判断用户是否已加入指定账本（标准化结果）
     * @param userId 加入者ID
     * @param shareUserId 分享者ID
     * @param shareBookId 账本ID
     * @returns 包含存在性、提示、数据的标准化结果
     */
    async bindJoinBook(
        userId: number,
        shareBookId: number
    ): Promise<any> {
        console.log("入参：", userId, shareBookId);
        try {
            // 1-3. 同上面的参数校验、账本校验、分享者校验逻辑（省略）
            const validUserId = Number(userId);
            const validShareBookId = Number(shareBookId);

            // 核心：判断记录是否存在
            const [relationInfo] = await pool.execute(
                `SELECT 1 
             FROM mate_book_user_relation 
             WHERE book_id = ? AND user_id = ?`,
                [validShareBookId, validUserId]
            );
            const hasRecord = (relationInfo as any[]).length > 0;

            // 返回标准化结果（包含布尔值）
            return {
                code: 200,
                message: hasRecord ? "存在关联记录" : "无关联记录",
                data: {
                    hasRecord, // 核心：true=有记录，false=无记录
                    bookId: validShareBookId,
                    userId: validUserId
                }
            };

        } catch (error: any) {
            console.error(`判断记录存在性失败：`, error.message);
            if (error instanceof HttpError) {
                throw error;
            }
            throw new HttpError(`判断记录存在性失败：${error.message}`, 500);
        }
    }
    /**
     * 加入分享的账本（接受邀请）
     * @param userId 加入者ID（被邀请人）
     * @param shareUserId 分享者ID（账本所有者，仅用于权限校验）
     * @param shareBookId 被分享的账本ID
     * @returns 操作结果
     */
    async joinBook(
        userId: number,
        shareUserId: number,
        shareBookId: number
    ): Promise<any> {
        console.log("入参：", userId, shareUserId, shareBookId);
        try {
            // 1. 严格参数校验
            const validUserId = Number(userId);
            const validShareUserId = Number(shareUserId);
            const validShareBookId = Number(shareBookId);

            // 校验参数是否为有效正整数
            if (!validUserId || isNaN(validUserId) || validUserId <= 0) {
                throw new HttpError("加入者ID必须为有效正整数", 400);
            }
            if (!validShareUserId || isNaN(validShareUserId) || validShareUserId <= 0) {
                throw new HttpError("分享者ID必须为有效正整数", 400);
            }
            if (!validShareBookId || isNaN(validShareBookId) || validShareBookId <= 0) {
                throw new HttpError("账本ID必须为有效正整数", 400);
            }

// 2. 校验账本是否存在且未删除
            const bookTableName = "mate_book"; // 替换为你的实际账本表名
            const [bookInfo] = await pool.execute(
                `SELECT id, user_id AS owner_id
                 FROM ${bookTableName}
                 WHERE id = ?
                   AND (is_deleted IS NULL OR is_deleted = 0)`,
                [validShareBookId]
            );
            const bookData = (bookInfo as any[])[0];
            if (!bookData) {
                throw new HttpError("该账本不存在或已被删除", 404);
            }

// 3. 校验分享者是否是该账本的所有者（防止非所有者伪造分享）
            if (bookData.owner_id !== validShareUserId) {
                throw new HttpError("该用户并非此账本的所有者，无法加入", 403);
            }

// 4. 核心逻辑：UPSERT（有则更新，无则新增）- 完全移除 share_user_id
            const [upsertResult] = await pool.execute(
                `INSERT INTO mate_book_user_relation (book_id,
                                                      user_id,
                                                      is_active,
                                                      created_at,
                                                      updated_at,
                                                      accept_time)
                 VALUES (?, ?, 1, NOW(), NOW(), NOW()) ON DUPLICATE KEY
                UPDATE
                    is_active = 1,
                    updated_at = NOW(),
                    accept_time = NOW()`,
                [validShareBookId, validUserId] // 仅保留2个参数，和SQL中的?完全匹配
            );

            console.log("UPSERT结果：", upsertResult, validShareBookId, validUserId);
            const upsertData = upsertResult as any;

// 5. 校验操作是否成功
            if (upsertData.affectedRows === 0) {
                throw new HttpError("加入账本失败，请重试", 500);
            }

// 6. 区分新增/更新，返回友好结果
            let operationType = upsertData.affectedRows === 1 ? "新增" : "更新";

            return {
                code: 200,
                message: `${operationType}记录成功，已加入该账本，可正常记账`,
                data: {
                    bookId: validShareBookId,
                    userId: validUserId,
                    ownerId: validShareUserId, // 仅用于返回，不存入关联表
                    joinTime: new Date().toLocaleString(),
                    operationType: operationType
                }
            };

        } catch (error: any) {
            console.error(`用户[${userId}]加入账本[${shareBookId}]失败：`, error.message);
            // 区分业务异常和系统异常
            if (error instanceof HttpError) {
                throw error;
            }
            throw new HttpError(`加入账本失败：${error.message}`, 500);
        }
    }
}

export default new UserModule();
