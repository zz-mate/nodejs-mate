<<<<<<< HEAD
import pool from '../../db/index.ts';
import type {AccountDbSchema} from '../../types'
import {formatAmount} from '../../utils/tools.ts'
import {formatDate} from "../../utils/date.ts";
=======
import pool from '../../db';
import type {AccountDbSchema} from '../../types'
import {formatAmount} from '../../utils/tools'
import {formatDate} from "../../utils/date";
>>>>>>> 4d9c73e (🐛 修复打包)

class AccountModule {
    accountTableName = 'mate_account';
    accountCategoryTableName = 'mate_account_category';






// 核心函数实现
async accountList(userId?: number | string, page: number = 1, pageSize: number = 10): Promise<any> {
    try {
        const validPage = Math.max(Number(page) || 1, 1);
        const validPageSize = Math.max(Number(pageSize) || 10, 1);
        const offset = (validPage - 1) * validPageSize;
        const validUserId = userId !== undefined ? Number(userId) : undefined;

        // 1. 构建基础查询条件
        let whereConditions: string[] = [
    'a.is_active = 1',
    'ac.is_active = 1'
];
let queryParams: any[] = [];

// 用户过滤规则
if (validUserId !== undefined && validUserId > 0) {
    whereConditions.push('(a.user_id = ? OR a.user_id IS NULL)');
    queryParams.push(validUserId);
} else {
    whereConditions.push('a.user_id IS NULL');
}

// 2. 查询所有分类+账户数据（包含新增的actual_amount字段）
const allDataSql = `
      SELECT
          -- 分类信息
          ac.id               AS category_id,
          ac.name             AS category_name,
          ac.parent_id        AS category_parent_id,
          ac.icon             AS category_icon,
          ac.color            AS category_color,
          ac.type             AS category_type,
          ac.sort_order       AS category_sort_order,
          -- 账户信息（新增actual_amount）
          a.id                AS account_id,
          a.user_id           AS account_user_id,
          a.parent_account_id AS account_parent_id,
          a.account_id        AS account_super_id,
          a.name              AS account_name,
          a.type              AS account_type,
          a.icon              AS account_icon,
          a.color             AS account_color,
          a.sort_order        AS account_sort_order,
          a.is_system         AS account_is_system,
          a.is_active         AS account_is_active,
          a.balance           AS account_balance,
          a.actual_amount     AS account_actual_amount, -- 新增支出金额字段
          a.card_no           AS account_card_no,
          a.bank_name         AS account_bank_name,
          a.remark            AS account_remark,
          a.created_at        AS account_created_at,
          a.updated_at        AS account_updated_at
      FROM ${this.accountTableName} a
               LEFT JOIN ${this.accountCategoryTableName} ac
                         ON a.parent_account_id = ac.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY ac.sort_order ASC, a.sort_order ASC
    `;
const [allDataResult] = await pool.execute(allDataSql, [...queryParams]);

// 3. 初始化统计变量
let totalAsset: number | string = 0;    // 总资产
let totalDebt: number | string = 0;     // 总负债
const allAccounts: AccountDbSchema[] = []; // 所有账户列表（用于统计）

// 4. 聚合分类+账户数据（按分类ID分组）
const categoryMap: Record<number, any> = {};
(allDataResult as any[]).forEach(item => {
    const categoryId = Number(item.category_id) || 0;

    // 初始化分类信息（仅第一次出现时）
    if (!categoryMap[categoryId]) {
        categoryMap[categoryId] = {
            category_id: categoryId,
            category_name: item.category_name || '未分类',
            category_parent_id: Number(item.category_parent_id) || 0,
            category_icon: item.category_icon || '',
            category_color: item.category_color || '#333333',
            category_type: Number(item.category_type) || 0,
            category_sort_order: Number(item.category_sort_order) || 0,
            category_remaining_amount: 0, // 初始化分类级剩余金额
            children: []
        };
    }

    // 格式化账户数据（保留账户级remaining_amount）
    if (item.account_id) {
        const balance = Number(item.account_balance);
        const actualAmount = (item.account_actual_amount);
        const remainingAmount = formatAmount(balance - actualAmount); // 账户级剩余金额
        const account: AccountDbSchema = {
            id: Number(item.account_id),
            user_id: item.account_user_id ? Number(item.account_user_id) : null,
            parent_account_id: item.account_parent_id ? Number(item.account_parent_id) : null,
            account_id: item.account_super_id ? Number(item.account_super_id) : null,
            name: item.account_name || '',
            type: Number(item.account_type) || 0,
            icon: item.account_icon || '',
            color: item.account_color || '#333333',
            sort_order: Number(item.account_sort_order) || 0,
            is_system: item.account_is_system as 0 | 1,
            is_active: item.account_is_active as 0 | 1,
            balance: balance,
            actual_amount: actualAmount,
            remaining_amount: remainingAmount, // 保留账户级剩余金额
            card_no: item.account_card_no || '',
            bank_name: item.account_bank_name || '',
            remark: item.account_remark || '',
            created_at: formatDate(item.account_created_at) || '',
            updated_at: formatDate(item.account_updated_at) || ''
        };

        // 添加到分类列表和全局账户列表
        categoryMap[categoryId].children.push(account);
        allAccounts.push(account);

        // 累加分类级剩余金额
        categoryMap[categoryId].category_remaining_amount = formatAmount(
            Number(categoryMap[categoryId].category_remaining_amount) + Number(remainingAmount),
        );

        // 统计总资产/总负债
        if (balance > 0) {
            // @ts-ignore
            totalAsset += balance; // 总资产：正余额总和
        } else if (balance < 0) {
            // @ts-ignore
            totalDebt += Math.abs(balance); // 总负债：负余额绝对值总和
        }
    }
});

// 计算净资产（总资产 - 总负债）
const netAsset = formatAmount(totalAsset - totalDebt);
// 格式化总资产/总负债（保留两位小数）
totalAsset = formatAmount(totalAsset);
totalDebt = formatAmount(totalDebt);

// 5. 处理分页（按分类维度分页）
const categoryList = Object.values(categoryMap);
const totalCategory = categoryList.length;
const paginatedCategoryList = categoryList.slice(offset, offset + validPageSize);

// 统计总账户数
const totalAccount = allAccounts.length;
const totalPage = Math.ceil(totalCategory / validPageSize);

// 6. 返回最终结构（含分类级剩余金额汇总）
return {
    asset_stats: {
        total_asset: totalAsset,
        net_asset: netAsset,
        total_debt: totalDebt
    },
    list: paginatedCategoryList,
    pagination: {
        total: totalAccount,
        total_category: totalCategory,
        page: validPage,
        pageSize: validPageSize,
        totalPage: totalPage
    }
};
} catch (error: any) {
    console.error('获取账户列表失败：', error.message, error.stack);
    // 异常兜底（统计字段默认0）
    return {
        asset_stats: {
            total_asset: 0,
            net_asset: 0,
            total_debt: 0
        },
        list: [],
        pagination: {
            total: 0,
            total_category: 0,
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

export default new AccountModule();


