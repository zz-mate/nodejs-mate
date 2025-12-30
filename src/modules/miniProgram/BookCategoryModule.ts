import pool from "../../db";
import type { BookDbSchema, PaginationData } from "../../types";
import HttpError from "../../utils/HttpError";
import { bookCategoryListService } from "@/services/miniProgram/bookCategoryService";

class bookCategoryListModule {
  bookCategoryTableName = "mate_book_category";

  // 账本是否存在
  async findById(bookId: number, userId: number): Promise<BookDbSchema | null> {
    const [rows] = await pool.execute(
      `SELECT id
             FROM ${this.bookCategoryTableName}
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
             FROM ${this.bookCategoryTableName}
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
   * 查询用户账本列表（分页）
   * @param page 当前页码（默认1）
   * @param pageSize 每页条数（默认10）
   * @returns 分页结果（列表 + 总条数 + 分页信息）
   */
  async bookCategoryList(
    page: number = 1,
    pageSize: number = 10
  ): Promise<PaginationData> {
    try {
      // 1. 参数校验 & 兜底（避免非数值/负数）
      const validPage = Math.max(Number(page) || 1, 1); // 页码最小为1
      const validPageSize = Math.max(Number(pageSize) || 10, 1); // 每页条数最小为1
      const offset = (validPage - 1) * validPageSize; // 计算偏移量

      // 2. 查询分页数据（LIMIT offset, pageSize）
      const [listRows] = await pool.execute(
        `SELECT
                     id,
                     name,
                     icon,
                     description,
                     sort AS sortNum,
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
                 FROM ${this.bookCategoryTableName}
                 ORDER BY created_at DESC -- 按创建时间倒序（可选，建议加排序）
                     LIMIT ?, ?`,
        [offset.toString(), validPageSize.toString()] // 绑定参数：userId + 偏移量 + 每页条数
      );

      // 3. 查询总条数（用于计算总页数）
      const [countRows] = await pool.execute(
        `SELECT COUNT(*) AS total
                 FROM ${this.bookCategoryTableName}`
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
          totalPage,
        },
      };
    } catch (error: any) {
      console.error("查询账本分页列表失败：", error.message);
      throw new HttpError(`查询账本列表失败：${error.message}`, 500);
    }
  }
}

export default new bookCategoryListModule();
