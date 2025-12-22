import pool from '../../db';
import {v4 as uuidv4} from "uuid"; // 核心导入语句
import type {BookDbSchema, PaginationData} from "../../types";
import HttpError from "../../utils/HttpError";

class UserModule {
    bookTableName = 'mate_book';

    /**
     * 创建书籍
     * @param userId 创建人ID
     * @param bookCategoryId 账本分类ID
     * @param icon 账本icon
     * @param name 账本名称
     * @param description 书籍描述
     * @returns 包含状态码和书籍数据的对象
     */
    async createBook(userId: number, bookCategoryId: number, icon: string, name: string, description: string): Promise<{
        code: number;
        data: BookDbSchema | null;
        message?: string
    }> {
        // 1. 入参校验
        if (!userId || !bookCategoryId || !name) {
            return {
                code: 400,
                data: null,
                message: '用户ID、分类ID和书籍名称为必填项'
            };
        }

        // 名称长度限制（根据数据库字段长度调整，示例为100）
        if (name.length > 100) {
            return {
                code: 400,
                data: null,
                message: '书籍名称长度不能超过100个字符'
            };
        }

        try {

            // 2. 校验书籍名称是否重复（两种场景可选其一）
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
                    message: `书籍名称「${name}」已存在，请勿重复创建`
                };
            }


            let uuid = uuidv4()
            // 2. 执行插入SQL
            const [insertResult] = await pool.execute(
                `INSERT INTO ${this.bookTableName}
                 (uuid, user_id, book_category_id, icon, name, description, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                [uuid, userId, bookCategoryId, icon, name, description || ''] // 描述为空时填充空字符串
            );

            // 3. 获取插入后的书籍完整信息
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
                data: newBook
            };
        } catch (error) {
            console.error('创建书籍失败:', error);

            // 处理重复键错误（如书籍名称唯一约束）
            if ((error as any).code === 'ER_DUP_ENTRY') {
                return {
                    code: 409,
                    data: null,
                    message: '书籍名称已存在，无法重复创建'
                };
            }

            // 通用服务器错误
            return {
                code: 500,
                data: null,
                message: '创建书籍失败，请稍后重试'
            };
        }
    }


    /**
     * 更新书籍信息（支持部分字段更新，新增is_default处理）
     * @param userId 操作人ID（用于权限校验）
     * @param bookId 书籍ID
     * @param updateData 要更新的字段（可选）
     * @returns 包含状态码和书籍数据的对象
     */
    /**
     * 更新书籍信息（修复is_default不更新问题）
     * @param userId 操作人ID（用于权限校验）
     * @param bookId 书籍ID
     * @param updateData 要更新的字段（可选）
     * @returns 包含状态码和书籍数据的对象
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
                message: '用户ID和书籍ID为必填项'
            };
        }

        // 名称长度校验
        if (updateData.name && updateData.name.length > 100) {
            return {
                code: 400,
                data: null,
                message: '书籍名称长度不能超过100个字符'
            };
        }

        // is_default 取值校验（仅允许 0/1）
        if (updateData.is_default !== undefined && !([0, 1].includes(updateData.is_default))) {
            return {
                code: 400,
                data: null,
                message: 'is_default仅支持传入0或1'
            };
        }

        // 开启事务
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // 2. 校验书籍归属
            const [bookCheckRows] = await connection.execute(
                `SELECT id, name FROM ${this.bookTableName} WHERE id = ? AND user_id = ? LIMIT 1`,
                [bookId, userId]
            );
            const targetBook = (bookCheckRows as BookDbSchema[])[0];
            if (!targetBook) {
                await connection.rollback();
                return { code: 404, data: null, message: '书籍不存在或无操作权限' };
            }

            // 3. 名称重复校验
            if (updateData.name) {
                const [nameCheckRows] = await connection.execute(
                    `SELECT id FROM ${this.bookTableName} WHERE name = ? AND user_id = ? AND id != ? LIMIT 1`,
                    [updateData.name, userId, bookId]
                );
                if ((nameCheckRows as BookDbSchema[]).length > 0) {
                    await connection.rollback();
                    return { code: 403, data: null, message: `书籍名称「${updateData.name}」已存在` };
                }
            }

            // 4. 处理默认书籍逻辑（置空当前用户所有默认）
            let needUpdateDefault = false;
            if (updateData.is_default === 1) {
                needUpdateDefault = true;
                // 将当前用户下所有书籍的is_default置为0
                await connection.execute(
                    `UPDATE ${this.bookTableName} SET is_default = 0, updated_at = NOW() WHERE user_id = ?`,
                    [userId]
                );
            }

            // 5. 动态构建更新字段（核心修复：确保is_default被加入）
            const updateFields: string[] = [];
            const updateParams: any[] = [];

            // 逐个判断字段，包括is_default
            if (updateData.bookCategoryId !== undefined) {
                updateFields.push('book_category_id = ?');
                updateParams.push(updateData.bookCategoryId);
            }
            if (updateData.icon !== undefined) {
                updateFields.push('icon = ?');
                updateParams.push(updateData.icon);
            }
            if (updateData.name !== undefined) {
                updateFields.push('name = ?');
                updateParams.push(updateData.name);
            }
            if (updateData.description !== undefined) {
                updateFields.push('description = ?');
                updateParams.push(updateData.description || '');
            }
            // 【核心修复】明确加入is_default字段的更新逻辑
            if (updateData.is_default !== undefined) {
                updateFields.push('is_default = ?');
                updateParams.push(updateData.is_default);
            }
            // 无更新字段时返回错误
            if (updateFields.length === 0) {
                await connection.rollback();
                return { code: 400, data: null, message: '请传入至少一个要更新的字段' };
            }

            // 增加更新时间
            updateFields.push('updated_at = NOW()');
            // 补充WHERE条件参数
            updateParams.push(bookId, userId);

            // 6. 执行更新（包含is_default）
            const [updateResult] = await connection.execute(
                `UPDATE ${this.bookTableName}
             SET ${updateFields.join(', ')}
             WHERE id = ? AND user_id = ?`,
                updateParams
            );

            if ((updateResult as any).affectedRows === 0) {
                await connection.rollback();
                return { code: 500, data: null, message: '书籍更新失败，未修改任何数据' };
            }

            // 提交事务
            await connection.commit();

            // 7. 查询更新后的完整数据（验证is_default是否生效）
            const [rows] = await pool.execute(
                `SELECT * FROM ${this.bookTableName} WHERE id = ? LIMIT 1`,
                [bookId]
            );
            const updatedBook = (rows as BookDbSchema[])[0];

            return { code: 200, data: updatedBook };
        } catch (error) {
            await connection.rollback();
            console.error('更新书籍失败:', error);
            if ((error as any).code === 'ER_DUP_ENTRY') {
                return { code: 409, data: null, message: '书籍名称已存在，无法更新' };
            }
            return { code: 500, data: null, message: '更新书籍失败，请稍后重试' };
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
    async bookInfo(userId: number, bookId: number): Promise<{ code: number; data: BookDbSchema }> {
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
            data: book
        }
    }

    /**
     * 查询用户账本列表（分页）
     * @param userId 用户ID（必填）
     * @param page 当前页码（默认1）
     * @param pageSize 每页条数（默认10）
     * @returns 分页结果（列表 + 总条数 + 分页信息）
     */
    async bookList(userId: number, page: number = 1, pageSize: number = 10): Promise<PaginationData> {
        try {
            // 1. 参数校验 & 兜底（避免非数值/负数）
            const validPage = Math.max(Number(page) || 1, 1); // 页码最小为1
            const validPageSize = Math.max(Number(pageSize) || 10, 1); // 每页条数最小为1
            const offset = (validPage - 1) * validPageSize; // 计算偏移量

            // 2. 查询分页数据（LIMIT offset, pageSize）
            const [listRows] = await pool.execute(
                `SELECT id,
                        user_id,
                        name,
                        icon,
                        book_category_id,
                        is_default,
                        -- 核心：将UTC时间转为东八区，并格式化为 YYYY-MM-DD HH:mm:ss
                        DATE_FORMAT(
                                CONVERT_TZ(created_at, '+00:00', '+08:00'),
                                '%Y-%m-%d %H:%i:%s'
                        ) AS created_at,
                        DATE_FORMAT(
                                CONVERT_TZ(updated_at, '+00:00', '+08:00'),
                                '%Y-%m-%d %H:%i:%s'
                        ) AS updated_at
                 FROM ${this.bookTableName}
                 WHERE user_id = ?
                 ORDER BY created_at DESC -- 按创建时间倒序（可选，建议加排序）
                     LIMIT ?, ?`,
                [userId, offset.toString(), validPageSize.toString()] // 绑定参数：userId + 偏移量 + 每页条数
            );

            // 3. 查询总条数（用于计算总页数）
            const [countRows] = await pool.execute(
                `SELECT COUNT(*) AS total
                 FROM ${this.bookTableName}
                 WHERE user_id = ?`,
                [userId]
            );
            const total = Number((countRows as any)[0]?.total || 0);
            const totalPage = Math.ceil(total / validPageSize); // 总页数（向上取整）

            // 4. 返回分页结果

            return {
                // @ts-ignore
                code: 200,
                list: listRows as any[],
                pagination: {
                    total,
                    page: validPage,
                    pageSize: validPageSize,
                    totalPage
                }

            };
        } catch (error: any) {
            console.error("查询账本分页列表失败：", error.message);
            throw new HttpError(`查询账本列表失败：${error.message}`, 500);
        }
    }

}

export default new UserModule();