import pool from '../../db/index.ts';
import type {CategoryDbSchema} from "../../types";

class UserModule {
    categoryTableName = 'mate_category';

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


    /**
     * 获取分类列表（树形结构 + 分页 + type过滤）
     * 核心规则：
     * - 不传userId/传无效值：仅查 user_id IS NULL 的公共分类
     * - 传有效userId：查 user_id=传入值 的分类 + user_id IS NULL 的公共分类
     * - type可选过滤：1=收入，2=支出，3=转账，不传则不过滤
     * @param userId 用户ID（可选，支持数字/字符串类型）
     * @param page 当前页（默认1）
     * @param pageSize 每页条数（默认10）
     * @param type 分类类型（可选：1/2/3）
     * @returns 树形分类+分页信息
     */
    async categoryList(userId?: number | string, page: number = 1, pageSize: number = 10, type?: 1 | 2 | 3 | number | string): Promise<any> {
        try {
            // 1. 分页参数标准化
            const validPage = Math.max(Number(page) || 1, 1);
            const validPageSize = Math.max(Number(pageSize) || 10, 1);
            const offset = (validPage - 1) * validPageSize;

            // 2. 构建核心查询条件
            let whereConditions: string[] = ['is_active = 1'];
            let queryParams: any[] = [];

// 2.1 处理userId过滤规则
            const validUserId = userId !== undefined ? Number(userId) : undefined;
            if (validUserId !== undefined && validUserId > 0) {
                // 传有效userId：自身分类 + 公共分类（user_id IS NULL）
                whereConditions.push('(user_id = ? OR user_id IS NULL)');
                queryParams.push(validUserId);
            } else {
                // 不传/传无效userId：仅查公共分类（user_id IS NULL）
                whereConditions.push('user_id IS NULL');
            }

// 2.2 处理type过滤规则（仅1/2/3生效）
            const validType = type !== undefined ? Number(type) : undefined;
            if (validType !== undefined && [1, 2, 3].includes(validType)) {
                whereConditions.push('type = ?');
                queryParams.push(validType);
            }

// 3. 步骤1：查询顶级分类（parent_id=0）总条数
            const [totalRows] = await pool.execute(
                `SELECT COUNT(*) AS total
                 FROM ${this.categoryTableName}
                 WHERE ${whereConditions.join(' AND ')}
                   AND parent_id = 0`,
                [...queryParams]
            );
            const total = Number((totalRows as any[])[0]?.total || 0);
            const totalPage = Math.ceil(total / validPageSize);

// 4. 步骤2：分页查询顶级分类（parent_id=0）
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
                 WHERE ${whereConditions.join(' AND ')}
                   AND parent_id = 0
                 ORDER BY is_system DESC, sort_order ASC LIMIT ?, ?`,
                [...queryParams, offset.toString(), validPageSize.toString()] // 移除多余的字符串转换，直接传数字
            );

// 5. 步骤3：查询所有符合条件的分类（用于构建子分类）
            const [allCategoryRows] = await pool.execute(
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
                 WHERE ${whereConditions.join(' AND ')}
                 ORDER BY is_system DESC, sort_order ASC`,
                [...queryParams]
            );

// 6. 格式化分类数据（统一为数字类型）
            const formatCategory = (item: any): CategoryDbSchema => ({
                id: Number(item.id),
                category_id: Number(item.id),
                user_id: item.user_id ? Number(item.user_id) : null,
                book_id: item.book_id ? Number(item.book_id) : null,
                parent_id: Number(item.parent_id),
                name: item.name,
                type: item.type as 1 | 2 | 3,
                icon: item.icon || '',
                color: item.color || '#333333',
                sort_order: Number(item.sort_order),
                is_system: item.is_system as 0 | 1,
                is_active: item.is_active as 0 | 1,
                created_at: item.created_at,
                updated_at: item.updated_at,
                children: [] as CategoryDbSchema[]
            });

            const allCategories = (allCategoryRows as any[]).map(formatCategory);
            const topCategories = (topCategoryRows as any[]).map(formatCategory);

// 7. 递归构建树形结构（parentId改为数字类型）
            const buildTree = (allCats: CategoryDbSchema[], parentId: number): CategoryDbSchema[] => {

                return allCats  // @ts-ignore
                    .filter(cat => cat.parent_id === parentId)
                    .map(cat => ({
                        ...cat,
                        children: buildTree(allCats, cat.id as any)
                    }));
            };

// 为分页后的顶级分类添加子分类
            const treeCategories = topCategories.map(topCat => ({
                ...topCat,
                children: buildTree(allCategories, topCat.id as any)
            }));


// 8. 返回最终结果
            return {
                list: treeCategories,
                pagination: {
                    total,
                    page: validPage,
                    pageSize: validPageSize,
                    totalPage
                }
            };
        } catch (error: any) {
            console.error('查询分类列表失败：', error.message, error.stack);
            // 异常兜底
            return {
                list: [],
                pagination: {
                    total: 0,
                    page: Math.max(Number(page) || 1, 1),
                    pageSize: Math.max(Number(pageSize) || 10, 1),
                    totalPage: 0
                }
            };
        }
    }


    async create(userId: number): Promise<any> {

    }
}

export default new UserModule();