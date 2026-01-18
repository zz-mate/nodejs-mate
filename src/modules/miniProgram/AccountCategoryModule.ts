import pool from "../../db/";
import pinyin from "pinyin";
import type { RowDataPacket, OkPacket } from "mysql2";

// 完善分类数据结构接口
export interface AccountCategoryDbSchema {
  id: number;
  user_id: number | null;
  parent_id: number;
  name: string;
  remark?: string;
  type: 1 | 2 | 3 | 4;
  icon: string;
  color: string;
  sort_order: number;
  is_system: 0 | 1;
  is_active: 0 | 1;
  created_at: string;
  updated_at: string;
}

// 创建分类入参接口
export interface CreateAccountCategoryParams {
  userId?: number | null | undefined; // 明确支持null/undefined
  parentId?: number;
  name: string;
  type: 1 | 2 | 3 | 4;
  icon?: string;
  color?: string;
  sortOrder?: number;
  isSystem?: 0 | 1;
  isActive?: 0 | 1;
  remark?: string;
}

export interface IndexedAccountCategory {
  letter?: string; // 首字母（如B、C、#等）
  data: Array<{
    id: number;
    type: 1 | 2 | 3 | 4;
    name: string;
  }>;
}

class AccountCategoryModule {
  private readonly accountCategoryTableName = "mate_account_category";

  /**
   * 获取账户分类列表（彻底修复 userId 可选逻辑）
   * @param userId 完全可选：不传/传undefined/传null/传0 都视为“不传”，仅查公共分类
   * @param page 页码（默认1）
   * @param pageSize 页大小（默认10）
   * @param parentId 父分类ID（默认0）
   */
  async accountCategoryList(
    userId?: number | string | null | undefined, // 支持所有常见类型
    page: number = 1,
    pageSize: number = 10,
    parentId?: number | string | null | undefined
  ): Promise<{
    list: AccountCategoryDbSchema[];
    pagination: {
      total: number;
      page: number;
      pageSize: number;
      totalPage: number;
    };
  }> {
    try {
      // 1. 强制参数标准化（核心：userId 完全可选）
      const validPage = Math.max(
        Number.isFinite(Number(page)) ? Number(page) : 1,
        1
      );
      const validPageSize = Math.max(
        Number.isFinite(Number(pageSize)) ? Number(pageSize) : 10,
        1
      );
      const validParentId =
        parentId != null
          ? Number.isFinite(Number(parentId))
            ? Number(parentId)
            : 0
          : 0;
      const offset = (validPage - 1) * validPageSize;

      // 2. 构建查询条件（彻底修复 userId 可选逻辑）
      let whereConditions: string[] = ["is_active = 1"];
      let queryParams: (number | null)[] = [];

      // 核心规则：
      // - userId 为 有效数字（>0）：查 该用户分类 + 公共分类
      // - 其他情况（不传/undefined/null/0/字符串/负数）：仅查公共分类
      let isUserIdValid = false;
      let parsedUserId: number | null = null;

      if (userId != null) {
        // 排除 undefined/null
        parsedUserId = Number(userId);
        isUserIdValid = Number.isFinite(parsedUserId) && parsedUserId > 0;
      }

      if (isUserIdValid) {
        // 传有效userId：自身分类 + 公共分类
        whereConditions.push("(user_id = ? OR user_id IS NULL)");
        queryParams.push(parsedUserId);
      } else {
        // 不传/传无效userId：仅查公共分类（user_id IS NULL）
        whereConditions.push("user_id IS NULL");
      }

      // 父分类ID过滤（默认0）
      whereConditions.push("parent_id = ?");
      queryParams.push(validParentId);

      // 3. 查询总条数（防空结果）
      const [totalRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
                 FROM ${this.accountCategoryTableName}
                 WHERE ${whereConditions.join(" AND ")}`,
        queryParams
      );
      const total = totalRows.length > 0 ? Number(totalRows[0]?.total || 0) : 0;
      const totalPage = Math.ceil(total / validPageSize);

      // 4. 分页查询（防空结果）
      const [categoryRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id,
                        user_id,
                        parent_id,
                        name,
                        remark,
                        icon,
                        color,
                        type,
                        sort_order,
                        is_system,
                        is_active,
                        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                        DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
                 FROM ${this.accountCategoryTableName}
                 WHERE ${whereConditions.join(" AND ")}
                 ORDER BY is_system DESC, sort_order ASC LIMIT ?, ?`,
        [...queryParams, offset.toString(), validPageSize.toString()]
      );

      // 5. 格式化数据（防undefined/空值）
      const formatCategory = (
        item: RowDataPacket
      ): AccountCategoryDbSchema => ({
        id: Number(item.id || 0),
        user_id:
          item.user_id !== null && Number.isFinite(item.user_id)
            ? Number(item.user_id)
            : null,
        parent_id: Number(item.parent_id || 0),
        name: item.name || "", remark: item.remark || "",
        type: item.type,
        icon: item.icon || "",
        color: item.color || "#666666",
        sort_order: Number(item.sort_order || 0),
        is_system:
          item.is_system === 0 || item.is_system === 1
            ? (item.is_system as 0 | 1)
            : 0,
        is_active:
          item.is_active === 0 || item.is_active === 1
            ? (item.is_active as 0 | 1)
            : 1,
        created_at: item.created_at || "",
        updated_at: item.updated_at || "",
      });

      const categoryList = Array.isArray(categoryRows)
        ? categoryRows.map(formatCategory)
        : [];

      // 6. 返回结构化结果（确保JSON可序列化）
      const result = {
        list: categoryList,
        pagination: {
          total,
          page: validPage,
          pageSize: validPageSize,
          totalPage,
        },
      };

      // 避免JSON.parse(JSON.stringify)的性能损耗，改用纯对象返回
      return JSON.parse(JSON.stringify(result)) as typeof result;
    } catch (error: any) {
      console.error("查询分类列表失败：", error.message, error.stack);
      // 兜底：返回绝对可序列化的空结果
      return {
        list: [],
        pagination: { total: 0, page: 1, pageSize: 10, totalPage: 0 },
      };
    }
  }

  /**
   * 创建分类（保持 userId 可选）
   */
  async create(
    params: CreateAccountCategoryParams
  ): Promise<{ id?: number; error?: string }> {
    try {
      // 1. 入参校验
      if (!params.name || params.name.trim() === "") {
        return { error: "分类名称不能为空" };
      }
      if (![1, 2, 3].includes(params.type)) {
        return { error: "分类类型必须为1（收入）、2（支出）、3（转账）" };
      }

      // 2. 参数标准化（userId 可选）
      const userId =
        params.userId != null &&
        Number.isFinite(params.userId) &&
        params.userId > 0
          ? params.userId
          : null; // 不传/无效值 → user_id = null（公共分类）
      const parentId =
        params.parentId != null && Number.isFinite(params.parentId)
          ? params.parentId
          : 0;
      const icon = params.icon || "";
      const color = params.color || "#666666";
      const sortOrder =
        params.sortOrder != null && Number.isFinite(params.sortOrder)
          ? params.sortOrder
          : 0;
      const isSystem =
        params.isSystem === 0 || params.isSystem === 1 ? params.isSystem : 0;
      const isActive =
        params.isActive === 0 || params.isActive === 1 ? params.isActive : 1;
      const remark = params.remark || "";

      // 3. 执行插入
      const [result] = await pool.execute<OkPacket>(
        `INSERT INTO ${this.accountCategoryTableName}
                 (user_id, parent_id, name, type, icon, color, sort_order, is_system, is_active, remark)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          parentId,
          params.name.trim(),
          params.type,
          icon,
          color,
          sortOrder,
          isSystem,
          isActive,
          remark,
        ]
      );

      // 4. 结果校验
      if (result.affectedRows === 0) {
        return { error: "创建分类失败，无数据插入" };
      }
      const insertId = result.insertId;
      if (!insertId) {
        return { error: "创建分类失败，未生成分类ID" };
      }

      return { id: insertId };
    } catch (error: any) {
      if (error.code === "ER_DUP_ENTRY") {
        return { error: "该分类名称已存在，无法重复创建" };
      }
      if (error.code === "ER_BAD_NULL_ERROR") {
        return { error: "必填字段不能为空" };
      }
      console.error("创建分类失败：", error.message, error.stack);
      return { error: `创建失败：${error.message}` };
    }
  }

  // 新增：测试方法（验证 userId 可选逻辑）
  async testUserIdOptional() {
    // 测试1：不传 userId → 仅查公共分类
    const case1 = await this.accountCategoryList();
    console.log("不传userId：", case1);

    // 测试2：传 undefined → 仅查公共分类
    const case2 = await this.accountCategoryList(undefined);
    console.log("传undefined：", case2);

    // 测试3：传 null → 仅查公共分类
    const case3 = await this.accountCategoryList(null);
    console.log("传null：", case3);

    // 测试4：传 0 → 仅查公共分类
    const case4 = await this.accountCategoryList(0);
    console.log("传0：", case4);

    // 测试5：传有效 userId → 查该用户+公共分类
    const case5 = await this.accountCategoryList(1001);
    console.log("传有效userId：", case5);
  }

    /**
     * 按首字母分组查询账户分类（仿城市索引）
     * @param parentId 父分类ID（必填，过滤指定父分类下的子分类）
     * @param isLetterGroup 【新增】是否按首字母分组（默认：false，不分组）
     * @returns 分类列表（分组模式：[{letter: 'B', data: [...]}, ...]；非分组模式：[{data: [...], letter: undefined}]）
     */
    async accountIndexCategoryList(
        parentId: number,
        isLetterGroup: boolean = false // 新增参数：默认不分组
    ): Promise<IndexedAccountCategory[]> {
        try {
            // 1. 参数校验：parentId 必须为有效数字
            const validParentId =
                Number.isFinite(parentId) && parentId >= 0 ? parentId : 0;

            // 2. 查询指定父分类下的所有启用分类（仅查核心字段）
            const [categoryRows] = await pool.execute<RowDataPacket[]>(
                `SELECT id, type, name, icon, parent_id
                 FROM ${this.accountCategoryTableName}
                 WHERE parent_id = ?
                   AND is_active = 1
                   AND type IN (1, 2, 3, 4) -- 过滤非法type，避免约束错误
                 ORDER BY name ASC`,
                [validParentId]
            );

            // 3. 空结果处理
            if (!Array.isArray(categoryRows) || categoryRows.length === 0) {
                return [];
            }

            // 4. 格式化基础分类数据（统一处理，分组/非分组复用）
            const formatCategoryItem = (item: RowDataPacket) => ({
                id: Number(item.id || 0),
                type: [1, 2, 3, 4].includes(item.type)
                    ? (item.type as 1 | 2 | 3 | 4)
                    : 2, // 兜底默认支出类
                name: item.name || "",
                icon: item.icon || "",
                parentId: Number(item.parent_id || 0)
            });

            // 格式化所有分类数据
            const formattedList = categoryRows.map(formatCategoryItem);

            // 5. 非分组模式：直接返回单层结构（核心改造点）
            if (!isLetterGroup) {
                return [{
                    letter: undefined, // 非分组模式隐藏字母字段
                    data: formattedList
                }];
            }

            // 6. 分组模式：按首字母分组（原有逻辑保留）
            // 工具函数：获取字符串首字母（中文转拼音首字母，非字母归为#）
            const getFirstLetter = (name: string): string => {
                if (!name || name.trim() === "") return "#";

                const firstChar = name.trim().charAt(0);
                // 正则匹配字母（大小写）
                const letterReg = /^[A-Za-z]$/;
                if (letterReg.test(firstChar)) {
                    return firstChar.toUpperCase();
                }

                // 使用pinyin库获取中文首字母（需安装：npm install pinyin）
                const pinyinArr = pinyin(firstChar, {
                    style: pinyin.STYLE_FIRST_LETTER,
                });
                const letter = pinyinArr[0][0]?.toUpperCase() || "#";

                return letter;
            };

            // 按首字母分组
            const groupedMap = new Map<string, IndexedAccountCategory["data"]>();
            formattedList.forEach((item) => {
                const letter = getFirstLetter(item.name);
                if (!groupedMap.has(letter)) {
                    groupedMap.set(letter, []);
                }
                groupedMap.get(letter)!.push(item);
            });

            // 转换为最终格式 + 按字母排序（A-Z，#放最后）
            const result = Array.from(groupedMap.entries())
                .map(([letter, data]) => ({ letter, data }))
                .sort((a, b) => {
                    // # 排最后，其他字母按A-Z排序
                    if (a.letter === "#") return 1;
                    if (b.letter === "#") return -1;
                    return a.letter.localeCompare(b.letter);
                });

            return result;
        } catch (error: any) {
            console.error("按首字母查询分类失败：", error.message, error.stack);
            // 异常兜底：返回空数组
            return [];
        }
    }
}

export default new AccountCategoryModule();
