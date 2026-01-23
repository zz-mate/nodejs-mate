<<<<<<< HEAD
import pool from '../../db/index.ts';
=======
import pool from '../../db/';
>>>>>>> 4d9c73e (🐛 修复打包)
import type {AccountCategoryDbSchema} from '../../types'


class AccountCategoryModule {
    accountCategoryTableName = 'mate_account_category';

    // 定义账户数据结构接口


    /**
     * 获取账户列表（分页 + parent_id过滤 + userId可选过滤）
     * 核心规则（和分类列表对齐）：
     * - 不传userId/传无效值：仅查 user_id IS NULL 的公共账户
     * - 传有效userId：查 user_id=传入值 的账户 + user_id IS NULL 的公共账户
     * - parent_id：不传默认查顶级账户（0），传则查对应子账户
     * @param userId 用户ID（可选，支持数字/字符串类型）
     * @param page 当前页（默认1）
     * @param pageSize 每页条数（默认10）
     * @param parentId 父账户ID（可选，默认0）
     * @returns 账户列表+分页信息
     */
    async accountList(
        userId?: number | string,
        page: number = 1,
        pageSize: number = 10,
        parentId?: number | string
    ): Promise<any> {
        try {
            // 1. 参数标准化
            const validPage = Math.max(Number(page) || 1, 1);
            const validPageSize = Math.max(Number(pageSize) || 10, 1);
            const validParentId = parentId !== undefined ? Number(parentId) : 0; // 不传默认0
            const offset = (validPage - 1) * validPageSize;

            // 2. 构建查询条件
            let whereConditions: string[] = ['is_active = 1']; // 仅查启用的账户
            let queryParams: any[] = [];

// 2.1 处理userId过滤规则（和分类列表完全对齐）
            const validUserId = userId !== undefined ? Number(userId) : undefined;
            if (validUserId !== undefined && validUserId > 0) {
                // 传有效userId：自身账户 + 公共账户（user_id IS NULL）
                whereConditions.push('(user_id = ? OR user_id IS NULL)');
                queryParams.push(validUserId);
            } else {
                // 不传/传无效userId：仅查公共账户（user_id IS NULL）
                whereConditions.push('user_id IS NULL');
            }

// 2.2 parent_id过滤（默认0，传则查对应值）
            whereConditions.push('parent_id = ?');
            queryParams.push(validParentId);

// 3. 步骤1：查询总条数
            const [totalRows] = await pool.execute(
                `SELECT COUNT(*) AS total
                 FROM ${this.accountCategoryTableName}
                 WHERE ${whereConditions.join(' AND ')}`,
                [...queryParams]
            );
            const total = Number((totalRows as any[])[0]?.total || 0);
            const totalPage = Math.ceil(total / validPageSize);

// 4. 步骤2：分页查询账户列表
            const [accountRows] = await pool.execute(
                `SELECT id,
                        user_id,
                        parent_id,
                        name,
                        icon,
                        color,
                        type,
                        sort_order,
                        is_system,
                        is_active,
                        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                        DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
                 FROM ${this.accountCategoryTableName}
                 WHERE ${whereConditions.join(' AND ')}
                 ORDER BY is_system DESC, sort_order ASC LIMIT ?, ?`,
                [...queryParams, offset.toString(), validPageSize.toString()]
            );

// 5. 格式化账户数据
            const formatAccount = (item: any): AccountCategoryDbSchema => ({
                id: Number(item.id),
                user_id: item.user_id ? Number(item.user_id) : null,
                parent_id: Number(item.parent_id),
                name: item.name,
                type: item.type,
                icon: item.icon || '',
                color: item.color || '#333333',
                sort_order: Number(item.sort_order),
                is_system: item.is_system as 0 | 1,
                is_active: item.is_active as 0 | 1,
                created_at: item.created_at,
                updated_at: item.updated_at
            });

            const accountList = (accountRows as any[]).map(formatAccount);

// 6. 返回结果
            return {
                list: accountList,
                pagination: {
                    total,
                    page: validPage,
                    pageSize: validPageSize,
                    totalPage
                }
            };
        } catch (error: any) {
            console.error('查询账户列表失败：', error.message, error.stack);
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

    async create(userId: number) {

    }
}

export default new AccountCategoryModule();