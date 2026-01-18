import pool from "../../db";

// 定义基础分类图标类型（匹配数据库字段）
interface CategoryIconDB {
    id: bigint;
    parent_id: bigint;
    name: string;
    icon: string;
    is_delete: number;
    created_at: Date;
    updated_at: Date;
}

// 定义子分类返回类型（含 isSelected）
interface CategoryChild {
    id: number;
    icon: string;
    isSelected: boolean;
}

// 定义层级分类返回类型
interface CategoryWithChildren {
    name: string;
    child: CategoryChild[];
}

// 定义分页返回结果类型
interface PaginationResult {
    list: CategoryWithChildren[]; // 层级结构的分类列表
    total: number; // 一级分类总条数
    page: number;
    pageSize: number;
    totalPages: number;
}

// 定义分页参数类型
interface PaginationParams {
    page: number;
    pageSize: number;
}

class CategoryIconModule {
    private billTableName = "mate_bill_category_icon";

    /**
     * 获取层级结构的账单分类图标列表（分页）
     * @param params 分页参数
     * @returns 层级结构的分页结果
     */
    async findAll(params: PaginationParams): Promise<PaginationResult> {
        // 处理默认参数
        const page = params.page || 1;
        const pageSize = params.pageSize || 10;
        const offset = (page - 1) * pageSize;

        try {
            // 1. 查询所有未删除的分类数据（扁平结构）
            const allDataSql = `
                SELECT id, parent_id, name, icon
                FROM ${this.billTableName}
                WHERE is_delete = 0
                ORDER BY parent_id ASC, id ASC
            `;
            const [allDataResult] = await pool.execute(allDataSql);
            const allData = allDataResult as CategoryIconDB[];

            // 2. 筛选一级分类（parent_id = 0）并分页
            // @ts-ignore
            const parentCategories = allData.filter(item => item.parent_id == 0);
            // 分页处理一级分类
            const paginatedParents = parentCategories.slice(offset, offset + pageSize);
            // 计算总页数
            const total = parentCategories.length;
            const totalPages = Math.ceil(total / pageSize);

            // 3. 构建层级结构（一级分类 + 子分类）
            const resultList: CategoryWithChildren[] = paginatedParents.map(parent => {
                // 筛选当前一级分类下的所有子分类（parent_id = 一级分类id）
                const children = allData
                    .filter(item => item.parent_id == parent.id)
                    .map(child => ({
                        id: Number(child.id), // 转换为数字类型
                        icon: child.icon,
                        isSelected: false // 默认未选中
                    }));

                return {
                    name: parent.name,
                    child: children
                };
            });

            return {
                list: resultList,
                total,
                page,
                pageSize,
                totalPages
            };

        } catch (error) {
            console.error("获取层级分类图标列表失败：", error);
            throw new Error(`查询分类图标列表出错：${(error as Error).message}`);
        }
    }

    /**
     * 扩展：根据一级分类名称查询指定分类的子列表（可选）
     * @param parentName 一级分类名称（如"内测"）
     * @returns 指定分类的层级结构
     */
    async findByParentName(parentName: string): Promise<CategoryWithChildren | null> {
        try {
            // 1. 查询一级分类
            const parentSql = `
        SELECT id, name 
        FROM ${this.billTableName} 
        WHERE parent_id = 0 AND name = ? AND is_delete = 0
      `;
            const [parentResult] = await pool.execute(parentSql, [parentName]);
            const parent = (parentResult as CategoryIconDB[])[0];

            if (!parent) return null;

            // 2. 查询该分类下的子分类
            const childSql = `
        SELECT id, icon 
        FROM ${this.billTableName} 
        WHERE parent_id = ? AND is_delete = 0
        ORDER BY id ASC
      `;
            const [childResult] = await pool.execute(childSql, [parent.id]);
            const children = (childResult as CategoryIconDB[]).map(child => ({
                id: Number(child.id),
                icon: child.icon,
                isSelected: false
            }));

            return {
                name: parent.name,
                child: children
            };
        } catch (error) {
            console.error("根据父分类名称查询失败：", error);
            throw new Error(`查询失败：${(error as Error).message}`);
        }
    }
}

export default new CategoryIconModule();