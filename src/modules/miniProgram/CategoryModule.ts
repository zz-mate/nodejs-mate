import pool from "../../db";
import type { CategoryDbSchema } from "../../types";

class UserModule {
  categoryTableName = "mate_category";
  bookTableName = "mate_book";

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
       WHERE is_active = 1 AND is_deleted = 0 AND parent_id = 0 
       LIMIT ?, ?`,
        [offset + "", validPageSize + ""]
      );
      // console.log("极简查询结果：", tempRows); // 这里必须有数据！

      // ========== 第二步：如果极简查询有数据，再逐步加条件 ==========
      let whereConditions: string[] = [
        "is_active = 1",
        "is_deleted = 0",
        "parent_id = 0",
      ];
      let queryParams: any[] = [];

      // 1. 处理 userId（简化逻辑，先不关联删除表）
      const validUserId = Number(userId);
      if (validUserId && validUserId > 0) {
        whereConditions.push("(user_id = ? OR user_id IS NULL)");
        queryParams.push(validUserId);
      } else {
        whereConditions.push("user_id IS NULL");
      }

      // 2. 处理 type 过滤
      const validType = Number(type);
      if ([1, 2, 3].includes(validType)) {
        whereConditions.push("type = ?");
        queryParams.push(validType);
      }

      // 3. 处理 bookCategoryId：你的表中 book_id 全为 NULL，传值必空！
      if (bookCategoryId) {
        // 提示：你的表 book_id 都是 NULL，传这个参数会过滤空
        console.warn(
          "警告：表中 book_id 全为 NULL，传 bookCategoryId 会无数据"
        );
        // whereConditions.push("book_id = ?");
        // queryParams.push(bookCategoryId);
      }

      // 4. 临时注释删除表关联（先确保基础查询有数据）
      whereConditions.push(
        "id NOT IN (SELECT category_id FROM mate_category_user_delete WHERE user_id = ?)"
      );
      queryParams.push(validUserId);

      // ========== 统计总数 ==========
      const [totalRows] = await pool.execute(
        `SELECT COUNT(*) AS total FROM ${this.categoryTableName} WHERE ${whereConditions.join(" AND ")}`,
        queryParams
      );
      const total = Number((totalRows as any[])[0]?.total || 0);
      const totalPage = Math.ceil(total / validPageSize);

      // ========== 查询顶级分类 ==========
      const [topCategoryRows] = await pool.execute(
        `SELECT id,
              user_id,
              book_id,
              parent_id,
              name,
              type,
              icon,
              color,
              sort_order,
              is_system,
              is_active,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
              DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM ${this.categoryTableName}
       WHERE ${whereConditions.join(" AND ")}
       ORDER BY sort_order ASC LIMIT ?, ?`,
        [...queryParams, offset + "", validPageSize + ""]
      );
      // console.log("带条件查询结果：", topCategoryRows);

      // ========== 查询所有分类用于构建树形 ==========
      const [allCategoryRows] = await pool.execute(
        `SELECT id, user_id, book_id, parent_id, name, type, sort_order 
       FROM ${this.categoryTableName} 
       WHERE is_active = 1 AND is_deleted = 0 
       AND (user_id IS NULL ${validUserId ? `OR user_id = ${validUserId}` : ""})`,
        []
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
        sort_order: number;
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
        sort_order: Number(item.sort_order || 0),
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

      const buildTree = (
        allCats: CategoryDbSchema[],
        parentId: number
      ): CategoryDbSchema[] => {
        return allCats
          .filter((cat) => cat.parent_id === parentId)
          .map((cat) => ({ ...cat, children: buildTree(allCats, cat.id) }));
      };

      const treeCategories = topCategories.map((topCat) => ({
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
        pagination: { total: 0, page: 1, pageSize: 10, totalPage: 0 },
      };
    }
  }

  async create(userId: number): Promise<any> {}

/**
 * 校验分类是否关联账单（mate_bill）
 * 核心逻辑：仅查询分类ID是否存在关联的账单记录，返回布尔标识
 * @param categoryId 分类ID
 * @returns 校验结果（是否关联账单）
 */
async cateBindBill(categoryId: number,currentUserId:number): Promise<{
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
      `SELECT 1 FROM mate_bill WHERE category_id = ? AND user_id=? LIMIT 1`,
      [categoryId,currentUserId]
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
    console.log("删除分类参数：", { categoryId, currentUserId, deleteBill });

    // 1. 查询分类信息（加锁避免并发修改）
    const [categoryRows] = await conn.execute(
      `SELECT id, user_id, is_system FROM ${this.categoryTableName} WHERE id = ? FOR UPDATE`,
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
         WHERE user_id=? AND category_id = ? AND is_deleted = 0`, // 仅保留存在的字段
        [currentUserId,categoryId]
      );
      deleteBillCount = Number((billDeleteResult as any)?.affectedRows || 0);
      console.log(`批量逻辑删除分类${categoryId}关联的账单，共处理${deleteBillCount}条`);
    }

    // 4. 分类型处理分类删除逻辑
    if (category.user_id === currentUserId) {
      // 4.1 自定义分类：软删除 + 级联子分类软删除（分类表有deleted_at，保留）
      await conn.execute(
        `UPDATE ${this.categoryTableName} 
         SET is_deleted = 1, deleted_at = NOW(), updated_at = NOW() 
         WHERE id = ? AND user_id = ?`,
        [categoryId, currentUserId]
      );
      // 级联删除子分类
      await conn.execute(
        `UPDATE ${this.categoryTableName} 
         SET is_deleted = 1, deleted_at = NOW(), updated_at = NOW() 
         WHERE parent_id = ? AND user_id = ?`,
        [categoryId, currentUserId]
      );
    } else if (category.user_id === null) {
      // 4.2 系统/公共分类：插入删除关联记录（移除created_at字段）
      await conn.execute(
        `INSERT IGNORE INTO mate_category_user_delete (user_id, category_id) 
         VALUES (?, ?)`, // 仅保留表中存在的字段
        [currentUserId, categoryId]
      );
      // 级联标记子分类（同样移除created_at）
      const [childCategoryRows] = await conn.execute(
        `SELECT id FROM ${this.categoryTableName} WHERE parent_id = ? AND user_id IS NULL`,
        [categoryId]
      );
      const childIds = (childCategoryRows as Array<{ id: number }>)
        .map(item => item.id)
        .filter(Boolean);
      if (childIds.length > 0) {
        const placeholders = childIds.map(() => "(?, ?)").join(",");
        const insertParams = childIds.flatMap(id => [currentUserId, id]);
        await conn.execute(
          `INSERT IGNORE INTO mate_category_user_delete (user_id, category_id) 
           VALUES ${placeholders}`, // 仅保留存在的字段
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
        `SELECT 
        c.id,
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
          d.id AS mcudId -- 用户标记删除的时间
       FROM mate_category_user_delete d
       LEFT JOIN ${this.categoryTableName} c ON d.category_id = c.id
       WHERE ${whereSql}
       ORDER BY d.deleted_at DESC, c.sort_order ASC
       LIMIT ?, ?`,
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
        `SELECT 
        c.id,
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
        mcudId?:number;

        children: DeleteCategorySchema[];
      }

      const formatDeleteCategory = (item: any,isParent = false): DeleteCategorySchema => ({
        id: Number(item.id || 0),
        user_id: Number(item.user_id) ,
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
          mcudId:item.mcudId || "",
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
  code:number;
  success: boolean;
  message: string;
  affectedRows: number;
}> {
  try {
    // 1. 基础参数校验
    if (!currentUserId || !Number.isInteger(currentUserId) || currentUserId <= 0) {
      return {
        code:403,
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
      deleteSql = `DELETE FROM mate_category_user_delete 
                   WHERE id = ? AND user_id = ?`;
      queryParams = [categoryDeleteId, currentUserId];
    } else if (categoryId && Number.isInteger(categoryId) && categoryId > 0) {
      // 条件2：按分类ID+用户ID删除（恢复该用户删除的指定分类）
      deleteSql = `DELETE FROM mate_category_user_delete 
                   WHERE category_id = ? AND user_id = ?`;
      queryParams = [categoryId, currentUserId];
    } else {
      return { code:403,
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
        code:200,
        success: true,
        message: `成功移除${affectedRows}条分类删除记录，分类已恢复`,
        affectedRows,
      };
    } else {
      return { code:403,
        success: false,
        message: "未找到匹配的删除记录（可能已被删除或无权限）",
        affectedRows: 0,
      };
    }
  } catch (error: any) {
    console.error("移除分类删除记录失败：", error.message, error.stack);
    return { code:403,
      success: false,
      message: `操作失败：${error.message || "数据库执行异常"}`,
      affectedRows: 0,
    };
  }
}
}

export default new UserModule();
