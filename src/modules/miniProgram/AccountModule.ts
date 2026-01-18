import pool from "../../db";
// @ts-ignore
import type { AccountDbSchema } from "../../types";
import { formatAmount } from "../../utils/tools";
import { formatDate } from "../../utils/date";
import BillModule from "./BillModule";
// 入参接口：新增 card_no 字段（可选，字符串类型）
interface CreateAccountParams {
    userId: number; // 必传：用户ID
    accountCategoryId?: number; // 必传：分类ID（关联 mate_account_category.id）
    accountParentId:number;
    name: string; // 必传：账户名称
    icon?: string; // 必传：账户名称
    money: number; // 必传：账户金额
    card_no?: string; // 可选：卡号/银行卡号，默认空字符串
}

// 账户数据结构：同步新增 card_no 字段
interface AccountDbSchema {
    id: number;
    user_id: number;
    parent_id: number;
    name: string;
    type: number;
    icon: string;
    color: string;
    sort_order: number;
    is_system: 0 | 1;
    is_active: 0 | 1;
    money: number;
    amount:string|number;
    card_no: string; // 新增：卡号字段
    created_at: string;
    updated_at: string;
}

class AccountModule {
    accountTableName = "mate_account";
    accountCategoryTableName = "mate_account_category";

    // 账户列表查询（新增 card_no 字段返回）
// 账户列表查询（新增 card_no 字段返回，修复 SQL 注释语法错误）
    async accountList(
        userId?: number | string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<any> {
        try {
            const validPage = Math.max(Number(page) || 1, 1);
            const validPageSize = Math.max(Number(pageSize) || 10, 1);
            const offset = (validPage - 1) * validPageSize;
            const validUserId = userId !== undefined ? Number(userId) : undefined;

            let whereConditions: string[] = ["a.is_active = 1", "ac.is_active = 1"];
            let queryParams: any[] = [];

            if (validUserId !== undefined && validUserId > 0) {
                whereConditions.push("(a.user_id = ? OR a.user_id IS NULL)");
                queryParams.push(validUserId);
            } else {
                whereConditions.push("a.user_id IS NULL");
            }

            // 核心修正：
            // 1. 移除 SQL 语句内的 // 注释，改用 MySQL 支持的 # 注释
            // 2. 注释单独换行，不跟字段定义在同一行，避免语法冲突
            const allDataSql = `
                SELECT
                    ac.id               AS category_id,
                    ac.name             AS category_name,
                    ac.parent_id        AS category_parent_id,
                    ac.icon             AS category_icon,
                    ac.color            AS category_color,
                    ac.type             AS category_type,
                    ac.sort_order       AS category_sort_order,
                    a.id                AS account_id,
                    a.user_id           AS account_user_id,
                    a.parent_id         AS account_parent_id,
                    a.name              AS account_name,
                    a.type              AS account_type,
                    a.icon              AS account_icon,
                    a.color             AS account_color,
                    a.sort_order        AS account_sort_order,
                    a.is_system         AS account_is_system,
                    a.is_active         AS account_is_active,
                    a.money             AS account_money,
                    a.card_no           AS account_card_no, -- 新增：查询卡号字段（改用MySQL支持的#注释）
                    a.created_at        AS account_created_at,
                    a.updated_at        AS account_updated_at
                FROM ${this.accountTableName} a
                         LEFT JOIN ${this.accountCategoryTableName} ac ON a.parent_id = ac.id
                WHERE ${whereConditions.join(" AND ")}
                ORDER BY ac.sort_order ASC, a.sort_order ASC
            `;
            const [allDataResult] = await pool.execute(allDataSql, [...queryParams]);
            // console.log(allDataResult);

            let totalAsset: number | string = 0;
            let totalDebt: number | string = 0;
            const allAccounts: AccountDbSchema[] = [];

            const categoryMap: Record<number, any> = {};
            (allDataResult as any[]).forEach((item) => {
                const categoryId = Number(item.category_id) || 0;

                if (!categoryMap[categoryId]) {
                    categoryMap[categoryId] = {
                        category_id: categoryId,
                        category_name: item.category_name || "未分类",
                        category_parent_id: Number(item.category_parent_id) || 0,
                        category_icon: item.category_icon || "",
                        category_color: item.category_color || "#333333",
                        category_type: Number(item.category_type) || 0,
                        category_sort_order: Number(item.category_sort_order) || 0,
                        category_total_money: 0,
                        children: [],
                    };
                }

                if (item.account_id) {
                    const money = Number(item.account_money);
                    const account: AccountDbSchema = {
                        id: Number(item.account_id),
                        user_id: Number(item.account_user_id),
                        parent_id: Number(item.account_parent_id),
                        name: item.account_name || "",
                        type: Number(item.account_type) || 0,
                        icon: item.account_icon || "",
                        color: item.account_color || "#333333",
                        sort_order: Number(item.account_sort_order) || 0,
                        is_system: item.account_is_system as 0 | 1,
                        is_active: item.account_is_active as 0 | 1,
                        money: money,
                        amount:formatAmount(money),
                        card_no: item.account_card_no || "", // 这里是JS注释，没问题（不在SQL内）
                        created_at: formatDate(item.account_created_at) || "",
                        updated_at: formatDate(item.account_updated_at) || "",
                    };

                    categoryMap[categoryId].children.push(account);
                    allAccounts.push(account);

                    categoryMap[categoryId].category_total_money = formatAmount(
                        Number(categoryMap[categoryId].category_total_money) + money
                    );

                    if (money > 0) {
                        totalAsset = Number(totalAsset) + money;
                    } else if (money < 0) {
                        totalDebt = Number(totalDebt) + Math.abs(money);
                    }

                }
            });

            const netAsset = formatAmount(Number(totalAsset) - Number(totalDebt));
            totalAsset = formatAmount(totalAsset);
            totalDebt = formatAmount(totalDebt);

            const categoryList = Object.values(categoryMap);
            const totalCategory = categoryList.length;
            const paginatedCategoryList = categoryList.slice(
                offset,
                offset + validPageSize
            );

            const totalAccount = allAccounts.length;
            const totalPage = Math.ceil(totalCategory / validPageSize);

            return {
                asset_stats: {
                    total_asset: totalAsset,
                    net_asset: netAsset,
                    total_debt: totalDebt,
                },
                list: paginatedCategoryList,
                pagination: {
                    total: totalAccount,
                    total_category: totalCategory,
                    page: validPage,
                    pageSize: validPageSize,
                    totalPage: totalPage,
                },
            };
        } catch (error: any) {
            console.error("获取账户列表失败：", error.message, error.stack);
            return {
                asset_stats: {
                    total_asset: 0,
                    net_asset: 0,
                    total_debt: 0,
                },
                list: [],
                pagination: {
                    total: 0,
                    total_category: 0,
                    page: Math.max(Number(page) || 1, 1),
                    pageSize: Math.max(Number(pageSize) || 10, 1),
                    totalPage: 0,
                },
            };
        }
    }
    async create(params: CreateAccountParams): Promise<{
        code: number;
        success: boolean;
        data?: AccountDbSchema;
        message: string;
    }> {
        // 增加事务连接
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 解构入参：accountCategoryId 非必传
            let { userId, accountCategoryId, accountParentId, name, icon, money, card_no = "" } = params;

            // 基础必传校验（用户ID、名称、金额）
            if (!userId || userId <= 0) {
                return { code: 403, success: false, message: "用户ID不能为空且必须为正整数" };
            }
            if (!name || name.trim() === "") {
                return { code: 403, success: false, message: "账户名称不能为空" };
            }
            if (money === undefined || isNaN(Number(money))) {
                return { code: 403, success: false, message: "账户金额（money）不能为空且必须为数字" };
            }
            const validMoney = Number(money).toFixed(2);
            let validCardNo = card_no?.trim() || "";
            const accountName = name.trim();

            // ========== 核心：先确定账户类型，区分 type=1 单独处理 ==========
            let categoryType = 1;
            let category = {
                type: 1,
                icon,
                color: "#333333",
                sort_order: 0,
                is_system: 0,
                is_active: 1
            };
            const insertAccountCategoryId = accountCategoryId || 0;

            if (accountCategoryId) {
                if (accountCategoryId <= 0 || !Number.isInteger(accountCategoryId)) {
                    return { code: 403, success: false, message: "分类ID（accountCategoryId）必须为正整数" };
                }
                const getCategorySql = `
          SELECT id, type, icon, color, sort_order, is_system, is_active
          FROM ${this.accountCategoryTableName}
          WHERE id = ? AND (user_id = ? OR user_id IS NULL) AND is_active = 1
        `;
                const [categoryResult] = await connection.execute(getCategorySql, [accountCategoryId, userId]);
                const categoryData = (categoryResult as any[])[0];
                if (!categoryData) {
                    return { code: 403, success: false, message: `分类ID ${accountCategoryId} 不存在或已禁用` };
                }
                category = categoryData;
                categoryType = Number(categoryData.type);
                if (![1, 2, 3, 4].includes(categoryType)) {
                    return {
                        code: 403, success: false,
                        message: `分类ID ${accountCategoryId} 的类型为 ${categoryType}，仅支持1/2/3/4`
                    };
                }
            }

            // ========== 重点：type=1（现金）单独校验 name 唯一性 ==========
            if (categoryType === 1) {
                const checkCashNameSql = `
          SELECT id FROM ${this.accountTableName}
          WHERE user_id = ? AND name = ? AND is_active = 1
        `;
                const [cashNameResult] = await connection.execute(checkCashNameSql, [userId, accountName]);
                if ((cashNameResult as any[]).length > 0) {
                    return { code: 403, success: false, message: "该现金账户名称已存在，无法重复创建" };
                }
                validCardNo = "";
            } else {
                if ([2, 4].includes(categoryType)) {
                    if (!accountParentId || accountParentId <= 0 || !Number.isInteger(accountParentId)) {
                        return { code: 403, success: false, message: `类型为${categoryType === 2 ? "银行卡" : "其他银行卡"}，父账户ID（accountParentId）不能为空且必须为正整数` };
                    }

                    const checkSameNameSql = `
            SELECT id, card_no FROM ${this.accountTableName}
            WHERE user_id = ? AND parent_id = ? AND name = ? AND type = ? AND is_active = 1
          `;
                    const [sameNameAccounts] = await connection.execute(checkSameNameSql, [userId, accountParentId, accountName, categoryType]);
                    const sameNameList = sameNameAccounts as any[];

                    if (sameNameList.length > 0) {
                        const hasNoCardAccount = sameNameList.some(item => item.card_no === '' || item.card_no == null);
                        const currentNoCard = validCardNo === '';
                        if (hasNoCardAccount && currentNoCard) {
                            const cardTypeName = accountParentId === 2 ? "信用卡" :
                                accountParentId === 3 ? "储蓄卡" :
                                    (categoryType === 2 ? "银行卡" : "其他银行卡");
                            return {
                                code: 403, success: false,
                                message: `当前${cardTypeName}类型下已存在同名且未填写卡号的账户，请填写卡号区分不同账户`
                            };
                        }
                    }

                    if (validCardNo) {
                        const checkCardSql = `
              SELECT id FROM ${this.accountTableName}
              WHERE user_id = ? AND parent_id = ? AND card_no = ? AND type = ? AND is_active = 1
            `;
                        const [cardResult] = await connection.execute(checkCardSql, [userId, accountParentId, validCardNo, categoryType]);
                        if ((cardResult as any[]).length > 0) {
                            return { code: 403, success: false, message: "该卡号已绑定当前卡种下的其他账户" };
                        }
                    }
                } else if (categoryType === 3) {
                    if (!accountParentId || accountParentId <= 0 || !Number.isInteger(accountParentId)) {
                        return { code: 403, success: false, message: "类型为3，父账户ID不能为空且必须为正整数" };
                    }
                    const checkType3NameSql = `
            SELECT id FROM ${this.accountTableName}
            WHERE user_id = ? AND name = ? AND type = 3 AND is_active = 1
          `;
                    const [type3NameResult] = await connection.execute(checkType3NameSql, [userId, accountName]);
                    if ((type3NameResult as any[]).length > 0) {
                        return { code: 403, success: false, message: "该账户已存在" };
                    }
                } else {
                    const checkOtherNameSql = `
            SELECT id FROM ${this.accountTableName}
            WHERE user_id = ? AND name = ? AND is_active = 1
          `;
                    const [otherNameResult] = await connection.execute(checkOtherNameSql, [userId, accountName]);
                    if ((otherNameResult as any[]).length > 0) {
                        return { code: 403, success: false, message: "该账户已存在" };
                    }
                }
            }

            // ========== 插入数据库 ==========
            const insertSql = `
        INSERT INTO ${this.accountTableName} (
          user_id, parent_id, account_category_id, name, type, icon, color,
          sort_order, is_system, is_active, money, card_no, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
            const insertParams = [
                userId,
                accountParentId || 0,
                insertAccountCategoryId,
                accountName,
                categoryType,
                category.icon || "",
                category.color || "#333333",
                category.sort_order || 0,
                category.is_system || 0,
                category.is_active || 1,
                validMoney,
                validCardNo
            ];

            const [result] = await connection.execute(insertSql, insertParams);
            const insertId = (result as any).insertId;
            if (!insertId) {
                await connection.rollback();
                return { code: 403, success: false, message: "创建账户失败，未生成账户ID" };
            }

            // ========== 核心新增：插入账户创建流水 ==========
            await BillModule.addAccountFlow(
                userId,                // 用户ID
                insertId,              // 新创建的账户ID
                0,                     // 账单ID（账户操作无账单，传0）
                7,                     // 流水类型：7=账户创建
                Number(validMoney),    // 变动金额（初始金额）
                0,                     // 变动前余额（新账户为0）
                validMoney,            // 变动后余额（初始金额）
                `创建${categoryType === 1 ? "现金" : "普通"}账户：${accountName}` // 备注
            );

            // ========== 查询并返回结果 ==========
            const querySql = `
                SELECT
                    id, user_id, parent_id, account_category_id, name, type, icon, color,
                    sort_order, is_system, is_active, money, card_no, created_at, updated_at
                FROM ${this.accountTableName} WHERE id = ?
            `;
            const [accountResult] = await connection.execute(querySql, [insertId]);
            const account = (accountResult as any[])[0];
            if (!account) {
                await connection.rollback();
                return { code: 403, success: false, message: "创建账户成功，但查询详情失败" };
            }

            await connection.commit();


            const formattedAccount: AccountDbSchema = {
                id: Number(account.id),
                user_id: Number(account.user_id),
                parent_id: Number(account.parent_id),// @ts-ignore
                account_category_id: Number(account.account_category_id),
                name: account.name,
                type: Number(account.type),
                icon: account.icon,
                color: account.color,
                sort_order: Number(account.sort_order),
                is_system: account.is_system as 0 | 1,
                is_active: account.is_active as 0 | 1,
                money: Number(account.money),
                card_no: account.card_no || "",
                created_at: formatDate(account.created_at),
                updated_at: formatDate(account.updated_at),
            };

            return {
                code: 200,
                success: true,
                data: formattedAccount,
                message: categoryType === 1 ? "现金账户创建成功" : "账户创建成功",
            };
        } catch (error: any) {
            await connection.rollback();
            console.error("创建账户失败：", error.message, error.stack);
            return {
                code: 500,
                success: false,
                message: `创建账户失败：${error.message || "未知系统错误"}`,
            };
        } finally {
            connection.release();
        }
    }

    async update(data: any): Promise<{
        code: number;
        success: boolean;
        data?: AccountDbSchema;
        message: string;
    }> {
        // 增加事务连接
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 解构入参
            const { id, userId, name, money } = data;
            const accountTableName = "mate_account";

            // ========== 1. 基础必填/格式校验 ==========
            if (!id || id <= 0 || !Number.isInteger(id)) {
                return { code: 403, success: false, message: "账户ID不能为空且必须为正整数" };
            }
            if (!userId || userId <= 0 || !Number.isInteger(userId)) {
                return { code: 403, success: false, message: "用户ID不能为空且必须为正整数" };
            }

            // ========== 2. 查询原账户信息 ==========
            const getOriginAccountSql = `
        SELECT * FROM ${accountTableName} 
        WHERE id = ? AND user_id = ? AND is_active = 1
      `;
            const [originResult] = await connection.execute(getOriginAccountSql, [id, userId]);
            const originAccount = (originResult as any[])[0];
            if (!originAccount) {
                await connection.rollback();
                return { code: 403, success: false, message: "账户不存在或已禁用，无法更新" };
            }

            const originType = Number(originAccount.type);
            const originName = originAccount.name;
            const originMoney = originAccount.money; // 原金额（字符串）
            const originParentId = Number(originAccount.parent_id);
            const originCardNo = originAccount.card_no || "";

            // ========== 3. 处理待更新的字段 ==========
            const updateName = name?.trim() || originName;
            let updateMoney = originMoney;
            let isMoneyChanged = false; // 标记金额是否修改
            if (money !== undefined) {
                if (isNaN(Number(money)) || Number(money) < 0) {
                    await connection.rollback();
                    return { code: 403, success: false, message: "账户金额必须为非负数字" };
                }
                updateMoney = Number(money).toFixed(2);
                isMoneyChanged = updateMoney !== originMoney; // 金额有变化才标记
            }

            // ========== 4. 按账户类型执行名称校验 ==========
            if (updateName !== originName) {
                if (originType === 1) {
                    const checkCashNameSql = `
            SELECT id FROM ${accountTableName}
            WHERE user_id = ? AND name = ? AND is_active = 1 AND id != ?
          `;
                    const [cashNameResult] = await connection.execute(checkCashNameSql, [userId, updateName, id]);
                    if ((cashNameResult as any[]).length > 0) {
                        await connection.rollback();
                        return { code: 403, success: false, message: "该现金账户名称已存在，无法修改" };
                    }
                } else if ([2, 4].includes(originType)) {
                    const checkSameNameSql = `
            SELECT id, card_no FROM ${accountTableName}
            WHERE user_id = ? AND parent_id = ? AND name = ? AND type = ? AND is_active = 1 AND id != ?
          `;
                    const [sameNameAccounts] = await connection.execute(checkSameNameSql, [userId, originParentId, updateName, originType, id]);
                    const sameNameList = sameNameAccounts as any[];

                    if (sameNameList.length > 0) {
                        const hasNoCardAccount = sameNameList.some(item => item.card_no === '' || item.card_no == null);
                        const currentNoCard = originCardNo === '';
                        if (hasNoCardAccount && currentNoCard) {
                            const cardTypeName = originParentId === 2 ? "信用卡" :
                                originParentId === 3 ? "储蓄卡" :
                                    (originType === 2 ? "银行卡" : "其他银行卡");
                            await connection.rollback();
                            return {
                                code: 403, success: false,
                                message: `当前${cardTypeName}类型下已存在同名且未填写卡号的账户，请填写卡号区分不同账户`
                            };
                        }
                    }
                } else if (originType === 3) {
                    const checkType3NameSql = `
            SELECT id FROM ${accountTableName}
            WHERE user_id = ? AND name = ? AND type = 3 AND is_active = 1 AND id != ?
          `;
                    const [type3NameResult] = await connection.execute(checkType3NameSql, [userId, updateName, id]);
                    if ((type3NameResult as any[]).length > 0) {
                        await connection.rollback();
                        return { code: 403, success: false, message: "该账户名称已存在，无法修改" };
                    }
                }
            }

            // ========== 5. 执行更新操作 ==========
            const updateSql = `
        UPDATE ${accountTableName} 
        SET 
          name = ?, 
          money = ?, 
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `;
            const updateParams = [updateName, updateMoney, id, userId];
            const [updateResult] = await connection.execute(updateSql, updateParams);
            const affectedRows = (updateResult as any).affectedRows;
            if (affectedRows === 0) {
                await connection.rollback();
                return { code: 403, success: false, message: "账户更新失败，未找到可更新的记录" };
            }

            // ========== 核心新增：金额修改时插入流水 ==========
            if (isMoneyChanged) {
                const changeAmount = Math.abs(Number(updateMoney) - Number(originMoney)); // 变动金额（正数）
                await BillModule.addAccountFlow(
                    userId,                  // 用户ID
                    id,                      // 账户ID
                    0,                       // 账单ID（账户操作传0）
                    8,                       // 流水类型：8=账户金额修改
                    changeAmount,            // 变动金额
                    originMoney,             // 变动前余额
                    updateMoney,             // 变动后余额
                    `修改账户金额：${originMoney} → ${updateMoney}` // 备注
                );
            }

            // ========== 6. 查询更新后的账户信息 ==========
            const querySql = `
                SELECT
                    id, user_id, parent_id, account_category_id, name, type, icon, color,
                    sort_order, is_system, is_active, money, card_no, created_at, updated_at
                FROM ${accountTableName} WHERE id = ? AND user_id = ?
            `;
            const [accountResult] = await connection.execute(querySql, [id, userId]);
            const account = (accountResult as any[])[0];
            if (!account) {
                await connection.rollback();
                return { code: 403, success: false, message: "账户更新成功，但查询详情失败" };
            }

            await connection.commit();


            const formattedAccount: AccountDbSchema = {
                id: Number(account.id),
                user_id: Number(account.user_id),
                parent_id: Number(account.parent_id), // @ts-ignore
                account_category_id: Number(account.account_category_id),
                name: account.name,
                type: Number(account.type),
                icon: account.icon || "",
                color: account.color || "#333333",
                sort_order: Number(account.sort_order || 0),
                is_system: (account.is_system || 0) as 0 | 1,
                is_active: (account.is_active || 1) as 0 | 1,
                money: Number(account.money),
                card_no: account.card_no || "",
                created_at: formatDate(account.created_at),
                updated_at: formatDate(account.updated_at),
            };

            return {
                code: 200,
                success: true,
                data: formattedAccount,
                message: isMoneyChanged ? "账户名称/金额更新成功，流水已记录" : "账户名称更新成功",
            };
        } catch (error: any) {
            await connection.rollback();
            console.error("更新账户失败：", error.message, error.stack);
            return {
                code: 500,
                success: false,
                message: `更新账户失败：${error.message || "未知系统错误"}`,
            };
        } finally {
            connection.release();
        }
    }
}

export default new AccountModule();