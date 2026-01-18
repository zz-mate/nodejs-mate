import pool from "../../db";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {planByMonthService} from "@/services/miniProgram/planService";

// ========== 核心数据接口定义（严格贴合数据库表结构） ==========
/** 计划子项接口（对应mate_plan_item表） */
interface PlanItem {
    id?: bigint;
    name: string;
    completed: boolean;
    create_time?: string;
    update_time?: string;
}

/** 计划分类接口（对应mate_plan_category表 + 完成百分比） */
interface PlanCategory {
    plan_id: any;
    id?: bigint;
    planId?: bigint;
    category_id: number; // 分类标识（1/2/3/4）
    title: string;
    items: PlanItem[];
    checked: boolean;
    note: string;
    priority: number;
    weight: number; // 权重（仅存储，不参与整体完成率计算）
    completion_rate: number; // 分类内子项完成百分比（0-100，保留2位小数）
    create_time?: string;
    update_time?: string;
}

/** 计划创建数据接口（对应mate_plan表 + 分类子项） */
// 类型定义（按需补充）
interface PlanCreateData {
    userId: number;
    name: string;
    desc?: string;
    planTime: string;
    planType?: number;
    content?: Array<{
        id?: number;
        category_id?: number; // 兼容旧字段
        title: string;
        items?: Array<{
            name: string;
            completed: boolean;
        }>;
        checked: boolean;
        note?: string;
        priority?: number;
        weight?: number;
    }>;
}
/** 计划更新数据接口 */
interface PlanUpdateData extends Partial<PlanCreateData> {
    planId: bigint; // 必须传计划ID
}

/** 创建/更新计划返回结果接口 */
interface PlanOperateResult {
    code: number;
    success: boolean;
    planId?: bigint;
    message: string;
}

/** 分页查询结果接口 */
interface PlanPageResult {
    code: number;
    list: any[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}
interface DayStat {
    year: string;
    month: string;
    day: string;
    income: number; // 备忘录数量（保留2位小数）
    expense: number; // 计划数量（保留2位小数）
}
class PlanModule {
    private planTableName = "mate_plan";
    private planCategoryTableName = "mate_plan_category";
    private planItemTableName = "mate_plan_item";
    /**
     * 创建计划（包含分类和子项）
     * @param data 前端传入的完整计划数据
     * @returns 插入结果
     */
    async create(data: PlanCreateData): Promise<PlanOperateResult> {
        let connection: PoolConnection | null = null;
        try {
            // ========== 前置数据校验 ==========
            if (!data.userId || data.userId <= 0) {
                return { code: 400, success: false, message: "用户ID不能为空且必须为正整数" };
            }
            if (!data.name || data.name.trim() === "") {
                return { code: 400, success: false, message: "计划名称不能为空" };
            }
            const timeRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;
            if (!data.planTime || !timeRegex.test(data.planTime)) {
                return {
                    code: 400,
                    success: false,
                    message: "计划时间不能为空且格式必须为 YYYY-MM-DD HH:mm 或 YYYY-MM-DD HH:mm:ss"
                };
            }

            // ========== 数据库事务操作 ==========
            connection = await pool.getConnection();
            await connection.beginTransaction();
            console.log("开始创建计划，用户ID：", data.userId);

            // 1. 插入计划主表
            const planSql = `
                INSERT INTO ${this.planTableName}
                    (user_id, name, \`desc\`, plan_time, plan_type)
                VALUES (?, ?, ?, ?, ?)
            `;
            const planValues = [
                Number(data.userId),
                data.name.trim(),
                data.desc?.trim() || "",
                data.planTime,
                Number(data.planType) || 0,
            ];
            const [planResult] = await connection.query<ResultSetHeader>(planSql, planValues);
            const planId = Number(planResult.insertId);
            console.log("计划主表插入成功，planId：", planId);

            // 2. 处理分类和子项
            const categoryList = Array.isArray(data.content) ? data.content : [];
            if (categoryList.length === 0) {
                await connection.commit();
                return {
                    code: 200,
                    success: true,

                    message: "计划创建成功（无分类子项）"
                };
            }

            // 2.1 收集分类数据（修复：用前端传入的id作为category_id）
            const categoryValues: Array<[number, number, string, number, string, number, number]> = [];
            // 记录前端分类ID和标题的映射，用于后续匹配
            const frontCategoryMap = new Map<number, string>();

            categoryList.forEach((category: any, index: number) => {
                // 修复：优先取前端传入的id，无则用索引+1（兼容前端字段）
                const categoryId = Number(category.id || category.category_id) || (index + 1);
                const title = category.title?.trim() || `未命名分类${index + 1}`;
                const checked = category.checked ? 1 : 0;
                const note = category.note?.trim() || "";
                const priority = Number(category.priority) || 2;
                const weight = Number(category.weight) || 0.0;

                if (title) {
                    categoryValues.push([
                        planId,
                        categoryId,
                        title,
                        checked,
                        note,
                        priority,
                        weight
                    ]);
                    frontCategoryMap.set(categoryId, title); // 记录映射
                }
            });
            console.log("待插入分类数据：", categoryValues);

            // 2.2 批量插入分类表
            if (categoryValues.length > 0) {
                const categorySql = `
                    INSERT INTO ${this.planCategoryTableName}
                        (plan_id, category_id, title, checked, note, priority, weight)
                    VALUES ?
                `;
                await connection.query(categorySql, [categoryValues]);
                console.log("分类表插入成功，共插入", categoryValues.length, "条");

                // 2.3 查询分类ID映射（修复：按plan_id + category_id精准匹配）
                const getCategoryIdsSql = `
                    SELECT id, category_id, title
                    FROM ${this.planCategoryTableName}
                    WHERE plan_id = ? AND is_delete = 0
                `;
                const [categoryRows] = await connection.query<RowDataPacket[]>(getCategoryIdsSql, [planId]);
                const categoryIdMap = new Map<number, number>(); // 前端category_id → 数据库自增id
                categoryRows.forEach((row) => {
                    categoryIdMap.set(Number(row.category_id), Number(row.id));
                    console.log("分类映射：前端category_id=", row.category_id, "→ 数据库id=", row.id);
                });

                // 2.4 收集子项数据（修复：精准匹配分类ID）
                const finalItemList: Array<[number, string, number]> = [];
                categoryList.forEach((category: any) => {
                    const categoryId = Number(category.id || category.category_id) || 0;
                    const dbCategoryId = categoryIdMap.get(categoryId);

                    if (dbCategoryId) {
                        const items = Array.isArray(category.items) ? category.items : [];
                        console.log("分类ID=", categoryId, "对应的子项数量：", items.length);

                        items.forEach((item: any) => {
                            const itemName = item.name?.trim() || "未命名子项";
                            const completed = item.completed ? 1 : 0;

                            if (itemName) {
                                finalItemList.push([dbCategoryId, itemName, completed]);
                                console.log("待插入子项：", { categoryId: dbCategoryId, name: itemName, completed });
                            }
                        });
                    } else {
                        console.warn("未找到分类ID映射：", categoryId);
                    }
                });

                // 2.5 批量插入子项表
                if (finalItemList.length > 0) {
                    const itemSql = `
                        INSERT INTO ${this.planItemTableName}
                            (category_id, name, completed)
                        VALUES ?
                    `;
                    await connection.query(itemSql, [finalItemList]);
                    console.log("子项表插入成功，共插入", finalItemList.length, "条");
                } else {
                    console.warn("无有效子项数据，跳过子项插入");
                }
            }

            // 3. 提交事务
            await connection.commit();
            console.log("计划创建事务提交成功，planId：", planId);


            return {
                code: 200,
                success: true, // @ts-ignore
                message: `计划及${categoryList.length}个分类${finalItemList.length || 0}个子项创建成功`
            };
        } catch (error) {
            if (connection) {
                await connection.rollback();
                console.error("创建计划失败，事务回滚：", error);
            }
            return {
                code: 500,
                success: false,
                message: `创建计划失败：${(error as Error).message || "数据库操作异常"}`
            };
        } finally {
            if (connection) connection.release();
        }
    }
    /**
     * 更新计划（含主表、分类、子项）
     * @param data 前端传入的更新数据
     * @returns 更新结果
     */
    async update(data: PlanUpdateData): Promise<PlanOperateResult> {
        // 基础参数校验
        if (!data.planId || data.planId <= 0) {
            return {
                code: 400,
                success: false,
                message: "计划ID不能为空且必须大于0",
            };
        }
        if (!data.userId || data.userId <= 0) {
            return {
                code: 400,
                success: false,
                message: "用户ID不能为空且必须大于0",
            };
        }

        let connection: PoolConnection | null = null;
        try {
            // 1. 获取连接并开启事务
            connection = await pool.getConnection();
            await connection.beginTransaction();

            // 2. 更新计划主表（仅更新传入的字段）
            const updateFields: string[] = [];
            const updateValues: (string | number | bigint)[] = [];

            if (data.name) {
                updateFields.push("name = ?");
                updateValues.push(data.name);
            }
            if (data.desc !== undefined) {
                updateFields.push("`desc` = ?");
                updateValues.push(data.desc || "");
            }
            if (data.planTime) {
                updateFields.push("plan_time = ?");
                updateValues.push(data.planTime);
            }
            if (data.planType !== undefined && data.planType >= 0) {
                updateFields.push("plan_type = ?");
                updateValues.push(data.planType);
            }

            // 主表有更新字段才执行更新
            if (updateFields.length > 0) {
                const planSql = `
                    UPDATE ${this.planTableName}
                    SET ${updateFields.join(", ")}, update_time = CURRENT_TIMESTAMP
                    WHERE id = ? AND user_id = ? AND is_delete = 0
                `;
                updateValues.push(data.planId);
                updateValues.push(data.userId);
                const [planResult] = await connection.query<ResultSetHeader>(planSql, updateValues);
                // 校验计划是否存在
                if (planResult.affectedRows === 0) {
                    throw new Error("计划不存在或无权限修改");
                }
            }

            // 3. 处理分类和子项更新
            if (data.content && Array.isArray(data.content) && data.content.length > 0) {
                // 3.1 查询该计划下已有的分类ID
                const [categoryRows] = await connection.query<RowDataPacket[]>(
                    `SELECT id, category_id FROM ${this.planCategoryTableName} WHERE plan_id = ? AND is_delete = 0`,
                    [data.planId]
                );
                const existCategoryMap = new Map<number, bigint>(); // category_id → 数据库ID
                const existCategoryIds: bigint[] = []; // 数据库自增ID列表
                categoryRows.forEach(row => {
                    existCategoryMap.set(Number(row.category_id), row.id);
                    existCategoryIds.push(row.id);
                });

                // 3.2 收集新增/更新的分类数据（增加空值校验）
                const newCategoryValues: any[] = [];
                const updateCategoryValues: any[] = [];
                const needDeleteCategoryIds = [...existCategoryIds]; // 待删除的分类ID
                const newCategoryIdMap = new Map<number, bigint>(); // 前端category_id → 数据库ID

                // 遍历前端传入的分类数据
                for (const category of data.content) {
                    // 核心修复：前端传入的是id，不是category_id
                    const categoryId = Number(category.id);
                    // 空值校验
                    if (!categoryId || categoryId <= 0) {
                        throw new Error("分类ID不能为空且必须大于0");
                    }
                    if (!category.title) {
                        throw new Error(`分类ID ${categoryId} 的名称不能为空`);
                    }

                    const dbCategoryId = existCategoryMap.get(categoryId);
                    // 有数据库ID表示更新已有分类
                    if (dbCategoryId) {
                        updateCategoryValues.push([
                            category.title,
                            category.checked ? 1 : 0,
                            category.note || "",
                            category.priority || 2,
                            category.weight || 0.0,
                            dbCategoryId,
                        ]);
                        newCategoryIdMap.set(categoryId, dbCategoryId);
                        // 从待删除列表移除
                        const delIndex = needDeleteCategoryIds.indexOf(dbCategoryId);
                        if (delIndex > -1) {
                            needDeleteCategoryIds.splice(delIndex, 1);
                        }
                    } else {
                        // 无ID表示新增分类（确保category_id不为null）
                        newCategoryValues.push([
                            data.planId,
                            categoryId, // 修复：使用前端传入的id作为category_id
                            category.title,
                            category.checked ? 1 : 0,
                            category.note || "",
                            category.priority || 2,
                            category.weight || 0.0,
                        ]);
                    }
                }

                // 3.3 更新已有分类
                if (updateCategoryValues.length > 0) {
                    const updateCategorySql = `
                        UPDATE ${this.planCategoryTableName}
                        SET title = ?, checked = ?, note = ?, priority = ?, weight = ?, update_time = CURRENT_TIMESTAMP
                        WHERE id = ? AND is_delete = 0
                    `;
                    for (const values of updateCategoryValues) {
                        await connection.query(updateCategorySql, values);
                    }
                }

                // 3.4 新增分类
                if (newCategoryValues.length > 0) {
                    const insertCategorySql = `
                        INSERT INTO ${this.planCategoryTableName}
                            (plan_id, category_id, title, checked, note, priority, weight)
                        VALUES ?
                    `;
                    await connection.query(insertCategorySql, [newCategoryValues]);

                    // 查询新增分类的ID映射
                    const [newCategoryRows] = await connection.query<RowDataPacket[]>(
                        `SELECT id, category_id FROM ${this.planCategoryTableName}
                         WHERE plan_id = ? AND category_id IN (?) AND is_delete = 0`,
                        [data.planId, newCategoryValues.map(item => item[1])] // 用category_id精准查询
                    );
                    newCategoryRows.forEach((row) => {
                        newCategoryIdMap.set(Number(row.category_id), row.id);
                    });
                }

                // 3.5 逻辑删除废弃分类
                if (needDeleteCategoryIds.length > 0) {
                    await connection.query(
                        `UPDATE ${this.planCategoryTableName} SET is_delete = 1, update_time = CURRENT_TIMESTAMP WHERE id IN (?)`,
                        [needDeleteCategoryIds]
                    );
                    // 级联逻辑删除子项
                    await connection.query(
                        `UPDATE ${this.planItemTableName} SET is_delete = 1, update_time = CURRENT_TIMESTAMP WHERE category_id IN (?)`,
                        [needDeleteCategoryIds]
                    );
                }

                // 3.6 处理子项更新
                for (const category of data.content) {
                    const categoryId = Number(category.id);
                    if (!categoryId || !category.items || !Array.isArray(category.items)) continue;

                    const dbCategoryId = newCategoryIdMap.get(categoryId);
                    if (!dbCategoryId) continue;

                    // 查询该分类下已有子项（用ID而非name作为标识）
                    const [itemRows] = await connection.query<RowDataPacket[]>(
                        `SELECT id, name, completed FROM ${this.planItemTableName} WHERE category_id = ? AND is_delete = 0`,
                        [dbCategoryId]
                    );
                    // 修复：用name做临时映射（建议前端传递子项ID，这里兼容现有逻辑）
                    const existItemMap = new Map<string, bigint>();
                    const existItemIds: bigint[] = [];
                    itemRows.forEach(row => {
                        existItemMap.set(row.name, row.id);
                        existItemIds.push(row.id);
                    });

                    // 收集新增/更新子项
                    const newItemValues: any[] = [];
                    const updateItemValues: any[] = [];
                    const needDeleteItemIds = [...existItemIds];

                    for (const item of category.items) {
                        if (!item.name) {
                            throw new Error("子项名称不能为空");
                        }

                        const dbItemId = existItemMap.get(item.name);
                        if (dbItemId) {
                            // 更新已有子项
                            updateItemValues.push([
                                item.completed ? 1 : 0,
                                dbItemId,
                            ]);
                            // 从待删除列表移除
                            const delIndex = needDeleteItemIds.indexOf(dbItemId);
                            if (delIndex > -1) {
                                needDeleteItemIds.splice(delIndex, 1);
                            }
                        } else {
                            // 新增子项
                            newItemValues.push([
                                dbCategoryId,
                                item.name,
                                item.completed ? 1 : 0,
                            ]);
                        }
                    }

                    // 3.7 更新子项
                    if (updateItemValues.length > 0) {
                        const updateItemSql = `
                            UPDATE ${this.planItemTableName}
                            SET completed = ?, update_time = CURRENT_TIMESTAMP
                            WHERE id = ? AND is_delete = 0
                        `;
                        for (const values of updateItemValues) {
                            await connection.query(updateItemSql, values);
                        }
                    }

                    // 3.8 新增子项
                    if (newItemValues.length > 0) {
                        const insertItemSql = `
                            INSERT INTO ${this.planItemTableName}
                                (category_id, name, completed)
                            VALUES ?
                        `;
                        await connection.query(insertItemSql, [newItemValues]);
                    }

                    // 3.9 逻辑删除废弃子项
                    if (needDeleteItemIds.length > 0) {
                        await connection.query(
                            `UPDATE ${this.planItemTableName} SET is_delete = 1, update_time = CURRENT_TIMESTAMP WHERE id IN (?)`,
                            [needDeleteItemIds]
                        );
                    }
                }
            }

            // 4. 提交事务
            await connection.commit();

            return {
                code: 200,
                success: true,
                planId: data.planId,
                message: "计划更新成功",
            };
        } catch (error) {
            if (connection) await connection.rollback();
            console.error("更新计划失败：", error);
            return {
                code: 500,
                success: false,
                message: `更新计划失败：${(error as Error).message || "数据库操作异常"}`,
            };
        } finally {
            if (connection) connection.release();
        }
    }

    /**
     * 删除计划（逻辑删除，级联删除分类和子项）
     * @param planId 计划ID
     * @param userId 用户ID（权限校验）
     * @returns 删除结果
     */
    async removePlan( userId: bigint,planId: bigint): Promise<PlanOperateResult> {
        if (!planId || planId <= 0 || !userId || userId <= 0) {
            return {
                code: 400,
                success: false,
                message: "计划ID和用户ID不能为空且必须大于0",
            };
        }

        let connection: PoolConnection | null = null;
        try {
            // 1. 获取连接并开启事务
            connection = await pool.getConnection();
            await connection.beginTransaction();

            // 2. 逻辑删除计划主表
            const planSql = `
                UPDATE ${this.planTableName}
                SET is_delete = 1, update_time = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ? AND is_delete = 0
            `;
            const [planResult] = await connection.query<ResultSetHeader>(planSql, [planId, userId]);
            if (planResult.affectedRows === 0) {
                await connection.rollback();
                return {
                    code: 404,
                    success: false,
                    message: "计划不存在或已被删除",
                };
            }

            // 3. 逻辑删除该计划下的所有分类
            await connection.query(
                `UPDATE ${this.planCategoryTableName}
                 SET is_delete = 1, update_time = CURRENT_TIMESTAMP
                 WHERE plan_id = ? AND is_delete = 0`,
                [planId]
            );

            // 4. 逻辑删除该计划下的所有子项
            await connection.query(
                `UPDATE ${this.planItemTableName} i
                     JOIN ${this.planCategoryTableName} c ON i.category_id = c.id
                     SET i.is_delete = 1, i.update_time = CURRENT_TIMESTAMP
                 WHERE c.plan_id = ? AND i.is_delete = 0`,
                [planId]
            );

            // 5. 提交事务
            await connection.commit();

            return {
                code: 200,
                success: true,
                message: "计划删除成功",
            };
        } catch (error) {
            if (connection) await connection.rollback();
            console.error("删除计划失败：", error);
            return {
                code: 500,
                success: false,
                message: `删除计划失败：${(error as Error).message || "数据库操作异常"}`,
            };
        } finally {
            if (connection) connection.release();
        }
    }

    /**
     * 计算分类下子项的完成百分比（保留2位小数）
     * @param items 分类下的子项列表
     * @returns 完成百分比
     */
    private calculateCategoryCompletionRate(items: PlanItem[]): number {
        if (!items || items.length === 0) {
            return 0;
        }
        const completedCount = items.filter(item => item.completed === true).length;
        const rate = (completedCount / items.length) * 100;
        return Math.round(rate * 100) / 100; // 保留2位小数
    }

    /**
     * 计算计划整体完成百分比（按全量子项计算，保留1位小数）
     * 完全对齐前端的calculateProgress逻辑
     * @param categories 计划下的所有分类（含子项）
     * @returns 整体完成百分比
     */
    private calculatePlanTotalCompletionRate(categories: PlanCategory[]): number {
        if (!categories || categories.length === 0) return 0;

        let totalItems = 0;
        let completedItems = 0;

        // 遍历所有分类的子项，统计总数和已完成数
        categories.forEach(category => {
            if (category.items && category.items.length) {
                totalItems += category.items.length;
                completedItems += category.items.filter(item => item.completed).length;
            }
        });

        // 计算百分比（保留1位小数）
        return totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 1000) / 10;
    }

    /**
     * 查询单条计划的完整数据（主表+分类+子项+完成率）
     * @param planId 计划ID
     * @param userId 用户ID（权限校验）
     * @returns 完整计划数据
     */
    async getPlanDetail(userId: bigint,planId: bigint ): Promise<any> {
        if (!planId || planId <= 0 || !userId || userId <= 0) {
            throw new Error("计划ID和用户ID不能为空且必须大于0");
        }

        const connection = await pool.getConnection();
        try {
            // 1. 查询主计划基本信息
            const planSql = `
                SELECT
                    id,
                    user_id,
                    name,
                    \`desc\`,
                    plan_type,
                    DATE_FORMAT(plan_time, '%Y-%m-%d %H:%i') AS plan_time,
                    DATE_FORMAT(create_time, '%Y-%m-%d %H:%i:%s') AS create_time,
                    DATE_FORMAT(update_time, '%Y-%m-%d %H:%i:%s') AS update_time,
                    is_delete
                FROM ${this.planTableName}
                WHERE id = ? AND user_id = ? AND is_delete = 0
            `;
            const [planRows] = await connection.query<RowDataPacket[]>(planSql, [planId, userId]);
            if (planRows.length === 0) {
                return null;
            }
            const plan = planRows[0];

            // 2. 查询该计划下的所有分类
            const categorySql = `
                SELECT
                    id,
                    category_id,
                    title,
                    checked,
                    note,
                    priority,
                    weight,
                    DATE_FORMAT(create_time, '%Y-%m-%d %H:%i:%s') AS create_time,
                    DATE_FORMAT(update_time, '%Y-%m-%d %H:%i:%s') AS update_time
                FROM ${this.planCategoryTableName}
                WHERE plan_id = ? AND is_delete = 0
                ORDER BY priority ASC
            `;
            const [categoryRows] = await connection.query<RowDataPacket[]>(categorySql, [planId]);
            const categories = categoryRows as PlanCategory[];

            // 3. 为每个分类查询子项，并计算分类完成率
            for (const category of categories) {
                const itemSql = `
                    SELECT
                        id,
                        name,
                        completed,
                        DATE_FORMAT(create_time, '%Y-%m-%d %H:%i:%s') AS create_time,
                        DATE_FORMAT(update_time, '%Y-%m-%d %H:%i:%s') AS update_time
                    FROM ${this.planItemTableName}
                    WHERE category_id = ? AND is_delete = 0
                    ORDER BY id ASC
                `;
                const [itemRows] = await connection.query<RowDataPacket[]>(itemSql, [category.id]);

                // 转换子项数据格式（completed转为布尔值）
                const items = itemRows.map(item => ({
                    id: item.id,
                    name: item.name,
                    completed: item.completed === 1,
                    create_time: item.create_time,
                    update_time: item.update_time
                }));

                // 计算分类完成率
                category.items = items;
                category.completion_rate = this.calculateCategoryCompletionRate(items);

                // 转换分类的checked为布尔值
                // @ts-ignore
                category.checked = category.checked === 1;

                // 移除冗余字段
                delete category.plan_id;
            }

            // 4. 计算计划整体完成率（完全对齐前端逻辑）
            const totalCompletionRate = this.calculatePlanTotalCompletionRate(categories);

            // 5. 组装完整数据
            const result = {
                // 主计划字段
                id: plan.id,
                user_id: plan.user_id,
                name: plan.name,
                desc: plan.desc,
                statu:true,
                plan_type: plan.plan_type,
                plan_time: plan.plan_time,
                create_time: plan.create_time,
                update_time: plan.update_time,
                is_delete: plan.is_delete,
                // 计划整体完成率（按全量子项计算，保留1位小数）
                completion_rate: totalCompletionRate,
                // 分类+子项+分类完成率
                content: categories
            };

            return result;
        } catch (error) {
            console.error("查询计划详情失败：", error);
            throw new Error(`查询计划详情失败：${(error as Error).message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * 分页查询用户的计划列表（支持筛选，返回主表+分类+子项+完成率）
     * @param userId 用户ID
     * @param plan_type 计划类型（-1 不筛选）
     * @param planDate 单日期筛选（YYYY-MM-DD）
     * @param planDateStart 日期范围开始
     * @param planDateEnd 日期范围结束
     * @param page 页码
     * @param pageSize 每页条数
     * @returns 分页结果
     */
    async list(
        userId: bigint,
        plan_type: number,
        planDate: string | null,
        planDateStart: string | null,
        planDateEnd: string | null,
        page: number,
        pageSize: number
    ): Promise<PlanPageResult> {
        // 1. 参数校验与修正
        if (userId <= 0) throw new Error("userId 必须大于0");
        const currentPage = page < 1 ? 1 : page;
        const currentPageSize = pageSize < 1 || pageSize > 100 ? 10 : pageSize;
        const offset = (currentPage - 1) * currentPageSize;

        const connection = await pool.getConnection();
        try {
            // 2. 动态构建筛选条件和参数
            let whereConditions = ["user_id = ?", "is_delete = 0"];
            let queryParams: (string | number | bigint)[] = [userId];

            // 2.1 计划类型筛选
            if (plan_type >= 0) {
                whereConditions.push("plan_type = ?");
                queryParams.push(plan_type);
            }

            // 2.2 计划日期筛选
            const dateReg = /^\d{4}-\d{2}-\d{2}$/;
            if (planDate && dateReg.test(planDate)) {
                whereConditions.push("DATE(plan_time) = ?");
                queryParams.push(planDate);
            } else {
                if (planDateStart && dateReg.test(planDateStart)) {
                    whereConditions.push("DATE(plan_time) >= ?");
                    queryParams.push(planDateStart);
                }
                if (planDateEnd && dateReg.test(planDateEnd)) {
                    whereConditions.push("DATE(plan_time) <= ?");
                    queryParams.push(planDateEnd);
                }
            }

            // 3. 查询主表总条数
            const countSql = `
                SELECT COUNT(*) as total
                FROM ${this.planTableName}
                WHERE ${whereConditions.join(" AND ")}
            `;
            const [countResult] = await connection.query<RowDataPacket[]>(countSql, queryParams);
            const total = countResult[0].total;
            const totalPages = Math.ceil(total / currentPageSize);

            // 4. 分页查询主计划ID
            const planIdSql = `
                SELECT id
                FROM ${this.planTableName}
                WHERE ${whereConditions.join(" AND ")}
                ORDER BY create_time DESC
                    LIMIT ? OFFSET ?
            `;
            const planIdParams = [...queryParams, currentPageSize, offset];
            const [planIdRows] = await connection.query<RowDataPacket[]>(planIdSql, planIdParams);
            const planIds = planIdRows.map(row => row.id);

            // 5. 批量查询每个计划的完整数据（含整体完成率）
            const planList: any[] = [];
            for (const planId of planIds) {
                const planDetail = await this.getPlanDetail(userId,planId);
                if (planDetail) {
                    planList.push(planDetail);
                }
            }

            // 6. 返回结果
            return {
                code:200,
                list: planList,
                total,
                page: currentPage,
                pageSize: currentPageSize,
                totalPages
            };
        } catch (error) {
            console.error("查询计划列表失败：", error);
            throw new Error(`查询计划列表失败：${(error as Error).message}`);
        } finally {
            connection.release();
        }
    }




/**
 * 按月份查询每日的备忘录/计划数量统计
 * @param userId 用户ID
 * @param startTime 月份（格式：YYYY-MM）
 * @returns { dailyList: [...] } 格式的结果，所有日期的income/expense均为数字0（无数据时）
 */
async planByMonth(userId: number, startTime: string) {
    // 初始化返回结果（兜底格式统一，确保dailyList是数组）
    const result = {
        dailyList: [] as {
            year: string;
            month: string;
            day: string;
            income: number; // 备忘录数量（plan_type=1）
            expense: number; // 计划数量（plan_type=2）
        }[]
    };
    try {
        // 1. 基础参数校验（严格校验，避免无效查询）
        if (!userId || userId <= 0) {
            console.warn("planByMonth 参数错误：用户ID不能为空且必须为正整数", { userId });
            return result;
        }
        if (!startTime || !/^\d{4}-\d{2}$/.test(startTime)) {
            console.warn("planByMonth 参数错误：时间格式必须为YYYY-MM", { startTime });
            return result;
        }

        // 2. 解析年月（确保数字类型）
        const [year, month] = startTime.split("-");
        const yearNum = Number(year);
        const monthNum = Number(month);
        if (isNaN(yearNum) || isNaN(monthNum)) {
            console.warn("planByMonth 参数错误：年月解析失败", { year, month });
            return result;
        }

        // 3. 生成当月所有日期（补零，如1→"01"），确保每个日期都有数据
        const generateAllDays = (y: number, m: number): string[] => {
            const days: string[] = [];
            const lastDay = new Date(y, m, 0).getDate(); // 获取当月最后一天
            for (let day = 1; day <= lastDay; day++) {
                days.push(day.toString().padStart(2, "0"));
            }
            return days;
        };
        const allDays = generateAllDays(yearNum, monthNum);

        // 4. 构建通用查询条件（统一用plan_time，适配表结构）
        const baseWhere = "user_id = ? AND DATE_FORMAT(plan_time, '%Y-%m') = ? AND is_delete = 0";

        // 5. 查询每日备忘录数量（income：plan_type=1）
        const memoSql = `
            SELECT
                DATE_FORMAT(plan_time, '%d') AS day,
                COUNT(*) AS count
            FROM mate_plan 
            WHERE ${baseWhere} AND plan_type = 1
            GROUP BY DATE_FORMAT(plan_time, '%d')
            ORDER BY day ASC
        `;
        const memoParams = [userId, startTime];
        const [memoResult] = await pool.execute<RowDataPacket[]>(memoSql, memoParams);
        const memoMap = new Map<string, number>();
        memoResult.forEach(item => {
            const dayStr = (item.day || "").padStart(2, "0");
            const count = Number(item.count) || 0; // 强制转数字，无数据=0
            if (dayStr) memoMap.set(dayStr, count);
        });


        // 6. 查询每日计划数量（expense：plan_type=2）
        const planSql = `
            SELECT
                DATE_FORMAT(plan_time, '%d') AS day,
                COUNT(*) AS count
            FROM mate_plan 
            WHERE ${baseWhere} AND plan_type = 2
            GROUP BY DATE_FORMAT(plan_time, '%d')
            ORDER BY day ASC
        `;
        const planParams = [userId, startTime];
        const [planResult] = await pool.execute<RowDataPacket[]>(planSql, planParams);
        const planMap = new Map<string, number>();
        planResult.forEach(item => {
            const dayStr = (item.day || "").padStart(2, "0");
            const count = Number(item.count) || 0; // 强制转数字，无数据=0
            if (dayStr) planMap.set(dayStr, count);
        });
        // console.log("计划查询结果：", planResult);

        // 7. 生成最终数据（核心：所有日期强制兜底0）
        result.dailyList = allDays.map(day => ({
            year: year,
            month: month,
            day: day,
            income: memoMap.get(day) ?? 0, // 备忘录无数据=0
            expense: planMap.get(day) ?? 0  // 计划无数据=0
        }));

    } catch (error: any) {
        // 异常时：生成当月所有日期，且income/expense全部为0
        console.error("planByMonth 查询失败：", {
            userId,
            startTime,
            error: error.message,
            stack: error.stack
        });
        // 即使报错，也返回当月所有日期，且值为0
        const [year, month] = startTime.split("-");
        if (year && month) {
            const yearNum = Number(year);
            const monthNum = Number(month);
            if (!isNaN(yearNum) && !isNaN(monthNum)) {
                // 内联生成日期，避免this调用错误
                const allDays = (y: number, m: number): string[] => {
                    const days: string[] = [];
                    const lastDay = new Date(y, m, 0).getDate();
                    for (let day = 1; day <= lastDay; day++) {
                        days.push(day.toString().padStart(2, "0"));
                    }
                    return days;
                };
                result.dailyList = allDays(yearNum, monthNum).map(day => ({
                    year,
                    month,
                    day,
                    income: 0,
                    expense: 0
                }));
            }
        }
    }

    // console.log("planByMonth 最终返回：", result);
    return result;
}

}

export default new PlanModule();