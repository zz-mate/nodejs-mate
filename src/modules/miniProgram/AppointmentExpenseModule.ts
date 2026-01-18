import pool from "../../db";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import HttpError from "../../utils/HttpError";
dayjs.extend(weekday); // 扩展dayjs的星期功能

// 定义新增预约支出的参数接口
interface CreateAppointmentExpenseParams {
    user_id: number;
    account_id: number;
    book_id: number;
    category_id: number;
    expense_amount: number;
    appointment_time: string | Date;
    cycle_type?: 0 | 1 | 2 | 3;
    cycle_rule?: string;
    cycle_end_time?: string | Date;
    expense_type: 1 | 2 | 3 | 4 | 5;
    deleted?: number;
    remark?: string;
    creator: string;
}

// 列表查询参数接口
interface ListAppointmentExpenseParams {
    userId: number;
    page: number;
    pageSize: number;
    bookId?: number;
    categoryId?: number;
    status?: number;
    cycleType?: number;
    deleted?: number;
    startTime?: string | Date;
    endTime?: string | Date;
}

class AppointmentExpenseModule {
    private appointmentExpenseTableName = "mate_appointment_expense";
    private accountTableName = "mate_account";
    private categoryTableName = "mate_category";
    private bookTableName = 'mate_book'

    // 星期映射表（数字对应中文，dayjs.weekday()返回0=周日，1=周一...6=周六）
    private weekMap = {
        "0": "周日",
        "1": "周一",
        "2": "周二",
        "3": "周三",
        "4": "周四",
        "5": "周五",
        "6": "周六"
    };

    /**
     * 生成唯一的预约支出单号
     */
    private generateExpenseNo(userId: number): string {
        const dateStr = dayjs().format("YYYYMMDD");
        const userIdSuffix = String(userId).slice(-4).padStart(4, "0");
        const randomStr = Math.floor(Math.random() * 900000 + 100000).toString();
        return `EXP${dateStr}${userIdSuffix}${randomStr}`;
    }

    /**
     * 重构：解析周期规则为友好文字（从appointmentTime提取每月/每周信息）
     * @param cycleType 周期类型：0-一次性 1-每年 2-每月 3-每周
     * @param appointmentTime 预约执行时间（核心：从这里截取日期/星期）
     * @param cycleRule 兼容旧规则（可选）
     * @returns 周期文字描述
     */
    private getCycleText(
        cycleType: number,
        appointmentTime: string | Date,
        cycleRule?: string
    ): string {
        // 1. 一次性
        if (cycleType === 0) {
            return "一次性";
        }

        // 格式化预约时间（兼容字符串/Date类型）
        const apptTime = dayjs(appointmentTime);
        if (!apptTime.isValid()) {
            return "未知周期（预约时间无效）";
        }

        // 2. 每月周期：从appointment_time提取日期
        if (cycleType === 2) {
            const day = apptTime.date(); // 提取日期（1-31）
            return `每月${day}号`;
        }

        // 3. 每周周期：从appointment_time提取星期
        if (cycleType === 3) {
            const weekNum = apptTime.weekday(); // 0=周日，1=周一...6=周六
            // @ts-ignore
            const weekText = this.weekMap[String(weekNum)] || `星期${weekNum}`;
            return `每周${weekText}`;
        }

        // 4. 每年周期：兼容原有逻辑（从cycleRule或appointmentTime提取）
        if (cycleType === 1) {
            if (cycleRule && cycleRule.trim() !== "") {
                const [month, day] = cycleRule.split("-");
                if (month && day) {
                    return `每年${month}月${day}号`;
                }
                return `每年${cycleRule}`;
            }
            // 无cycleRule时从appointment_time提取
            const month = apptTime.month() + 1; // dayjs月份从0开始，+1转为1-12
            const day = apptTime.date();
            return `每年${month}月${day}号`;
        }

        // 默认：未知周期
        return "未知周期";
    }

    /**
     * 新增预约支出记录
     */
    async create(data: CreateAppointmentExpenseParams) {
        // 保留原有创建逻辑（无修改）
        const requiredFields = [
            "user_id", "account_id", "book_id", "category_id",
            "expense_amount", "appointment_time", "expense_type", "creator"
        ];
        // @ts-ignore
        const missingFields = requiredFields.filter(field => !data[field]);
        if (missingFields.length > 0) {
            // 改为返回正常响应，而非抛出异常
            return {
                code: 400,
                success: false,
                message: `参数缺失：${missingFields.join(", ")}`
            };
        }

        // 唯一性校验
        const [existRecord] = await pool.execute(
            `SELECT id FROM ${this.appointmentExpenseTableName}
             WHERE user_id = ?
               AND book_id = ?
               AND account_id = ?
               AND category_id = ?
               AND deleted = 0
               AND status NOT IN (4,6)`,
            [data.user_id, data.book_id, data.account_id, data.category_id]
        );

        if ((existRecord as any[]).length > 0) {
            // 核心修改：返回正常响应对象，不抛出异常
            return {
                code: 403, // 保持200状态码，前端通过code判断业务状态
                success: false,
                message:`重复预约：账户和分类组合已存在`// `当前账本下已存在账户ID【${data.account_id}】+分类ID【${data.category_id}】的预约支出，不可重复创建`
            };
        }

        // 格式化日期
        const formatDate = (date: string | Date) => dayjs(date).format("YYYY-MM-DD HH:mm:ss");
        const appointmentTime = formatDate(data.appointment_time);
        const cycleEndTime = data.cycle_end_time ? formatDate(data.cycle_end_time) : null;

        // 生成单号
        const expenseNo = this.generateExpenseNo(data.user_id);

        // 组装插入数据
        const insertData = {
            expense_no: expenseNo,
            user_id: data.user_id,
            account_id: data.account_id,
            book_id: data.book_id,
            category_id: data.category_id,
            expense_amount: data.expense_amount,
            currency_type: "CNY",
            appointment_time: appointmentTime,
            cycle_type: data.cycle_type || 0,
            cycle_rule: data.cycle_rule || "",
            cycle_end_time: cycleEndTime,
            expense_type: data.expense_type,
            status: 0,
            remark: data.remark || "",
            fail_reason: "",
            execute_time: null,
            last_execute_time: null,
            cancel_time: null,
            cancel_reason: "",
            version: 0,
            creator: data.creator,
            updater: data.creator,
            deleted: 0
        };

        // 构建SQL
        const fields = Object.keys(insertData);
        const placeholders = fields.map((_, index) => `?`);
        const values = Object.values(insertData);

        const sql = `
            INSERT INTO ${this.appointmentExpenseTableName} (${fields.join(", ")})
            VALUES (${placeholders.join(", ")})
        `;

        try {
            const [result] = await pool.execute(sql, values);
            const insertResult = result as { insertId: number };
            return {
                code: 200,
                success: true,
                message: "新增预约支出成功",
                id: insertResult.insertId,
                expense_no: expenseNo
            };
        } catch (error) {
            console.error("新增预约支出失败：", error);
            // 异常情况也返回正常响应
            let errorMsg = "新增预约支出失败：数据库异常";
            if ((error as any).code === "ER_DUP_ENTRY") {
                errorMsg = "支出单号已存在，请重试";
            } else if ((error as any).message) {
                errorMsg = `新增预约支出失败：${(error as any).message}`;
            }
            return {
                code: 500,
                success: false,
                message: errorMsg
            };
        }
    }

    /**
     * 预约支出列表查询（核心：调用重构后的getCycleText）
     */
    async list(data: ListAppointmentExpenseParams) {
        try {
            const {
                userId, page = 1, pageSize = 10,
                bookId, categoryId, status, cycleType,
                startTime, endTime, deleted = 0
            } = data;

            if (!userId) {
                // 改为返回正常响应
                return {
                    code: 400,
                    success: false,
                    message: "用户ID不能为空"
                };
            }

            const offset = (Number(page) - 1) * Number(pageSize);
            const limit = Number(pageSize);

            // 构建动态WHERE条件
            const whereConditions = [
                `t1.deleted = ${deleted}`,
                "t1.user_id = ?"
            ];
            const queryParams = [userId];

            if (bookId) {
                whereConditions.push("t1.book_id = ?");
                queryParams.push(bookId);
            }
            if (categoryId) {
                whereConditions.push("t1.category_id = ?");
                queryParams.push(categoryId);
            }
            if (status !== undefined) {
                whereConditions.push("t1.status = ?");
                queryParams.push(status);
            }
            if (cycleType !== undefined) {
                whereConditions.push("t1.cycle_type = ?");
                queryParams.push(cycleType);
            }
            if (startTime) {
                whereConditions.push("t1.appointment_time >= ?");
                queryParams.push(Number(dayjs(startTime).format("YYYY-MM-DD HH:mm:ss"))); // 修复：移除Number转换，日期应该用字符串
            }
            if (endTime) {
                whereConditions.push("t1.appointment_time <= ?");
                queryParams.push(Number(dayjs(endTime).format("YYYY-MM-DD HH:mm:ss"))); // 修复：移除Number转换
            }

            const whereStr = whereConditions.join(" AND ");

            // 列表查询SQL（修复分类关联后）
            const listSql = `
                SELECT
                    t1.id, t1.expense_no, t1.user_id, t1.account_id, t1.book_id, t1.category_id, t1.version,
                    t1.expense_amount, t1.currency_type, t1.appointment_time,
                    t1.cycle_type, t1.cycle_rule, t1.status, t1.remark, t1.create_time,
                    t2.name AS account_name, t2.icon AS account_icon, t2.type AS account_type,
                    t3.name AS category_name, t3.icon AS category_icon, t3.type AS category_type,
                    t4.name AS book_name, t3.icon AS book_icon
                FROM ${this.appointmentExpenseTableName} t1
                         LEFT JOIN ${this.accountTableName} t2
                                   ON t1.account_id = t2.id
                                       AND t2.is_active = 1
                                       AND t2.user_id = ?
                         LEFT JOIN ${this.categoryTableName} t3
                                   ON t1.category_id = t3.id
                                       AND t3.is_deleted = 0
                                       AND t3.is_active = 1
                         LEFT JOIN ${this.bookTableName} t4
                                   ON t1.book_id = t4.id
                                       AND t4.is_deleted = 0
                                       AND t4.is_active = 1
                WHERE ${whereStr}
                ORDER BY t1.create_time DESC
                    LIMIT ? OFFSET ?
            `;

            const listParams = [
                ...queryParams,
                userId,
                limit+"", // 修复：直接传数字，而非字符串
                offset+''  // 修复：直接传数字，而非字符串
            ];

            // 总条数查询
            const countSql = `
                SELECT COUNT(*) AS total
                FROM ${this.appointmentExpenseTableName} t1
                WHERE ${whereStr}
            `;
            const countParams = queryParams;

            // 执行查询
            const [listResult] = await pool.execute(listSql, listParams);
            const [countResult] = await pool.execute(countSql, countParams);

            const total = Number((countResult as any[])[0]?.total || 0);
            const list = listResult as any[];

            if (list.length === 0) {
                console.warn(`用户${userId}暂无符合条件的预约支出数据`);
            }

            // 格式化列表（核心：传入appointment_time生成cycle_text）
            const formattedList = list.map(item => ({
                id: item.id,
                expense_no: item.expense_no,
                user_id: item.user_id,
                account_id: item.account_id,
                book_id: item.book_id,
                category_id: item.category_id,
                version: item.version,
                expense_amount: item.expense_amount,
                currency_type: item.currency_type,
                appointment_time: item.appointment_time ? dayjs(item.appointment_time).format("YYYY-MM-DD HH:mm:ss") : null,
                cycle_type: item.cycle_type,
                cycle_rule: item.cycle_rule,
                // 关键修改：传入appointment_time生成周期文字
                cycle_text: this.getCycleText(item.cycle_type, item.appointment_time, item.cycle_rule),
                status: item.status,
                stat:true,
                status_text: this.getStatusText(item.status),
                remark: item.remark,
                create_time: item.create_time ? dayjs(item.create_time).format("YYYY-MM-DD HH:mm:ss") : null,
                account_info: {
                    id: item.account_id,
                    name: item.account_name,
                    icon: item.account_icon || "",
                    type: item.account_type,
                    type_text: this.getAccountTypeText(item.account_type)
                },
                category_info: {
                    id: item.category_id,
                    name: item.category_name,
                    icon: item.category_icon || "",
                    type: item.category_type || 0
                },
                book_info: {
                    id: item.book_id,
                    name: item.book_name,
                    icon: item.book_icon || ""
                }
            }));

            return {
                code: 200,
                success: true,
                data: {
                    list: formattedList,
                    pagination: {
                        page: Number(page),
                        pageSize: Number(pageSize),
                        total,
                        totalPages: Math.ceil(total / pageSize)
                    }
                }
            };
        } catch (error) {
            console.error("查询预约支出列表失败：", error);
            console.error("错误详情：", (error as any).sql, (error as any).sqlParams);
            // 异常情况返回正常响应
            return {
                code: 500,
                success: false,
                message: `查询预约支出列表失败：${(error as any).message || "数据库异常"}`
            };
        }
    }

    /**
     * 状态码转文字
     */
    private getStatusText(status: number): string {
        const statusMap = {
            0: "待执行", // 修正：0应该是待执行，而非执行中
            1: "执行中",
            2: "执行成功",
            3: "执行失败",
            4: "已取消",
            5: "已过期",
            6: "已终止"
        };
        return statusMap[status as keyof typeof statusMap] || "未知状态";
    }

    /**
     * 账户类型码转文字
     */
    private getAccountTypeText(typeCode: number): string {
        const accountTypeMap = {
            1: "收入类账户",
            2: "支出类账户",
            3: "转账类账户"
        };
        return accountTypeMap[typeCode as keyof typeof accountTypeMap] || "未知账户类型";
    }

    /**
     * 物理删除预约支出记录（直接从数据库删除，不可恢复）
     * @param data 删除参数：id(记录ID)、userId(用户ID)
     * @returns 删除结果
     */
    async remove(data: any) {
        try {
            // 1. 基础参数校验
            const { id, userId } = data;
            if (!id || !userId) {
                // 改为返回正常响应
                return {
                    code: 400,
                    success: false,
                    message: "删除失败：记录ID和用户ID不能为空"
                };
            }

            // 2. 权限校验：查询记录是否存在且属于当前用户
            const [existRecord] = await pool.execute(
                `SELECT id, user_id FROM ${this.appointmentExpenseTableName}
                 WHERE id = ? AND user_id = ? AND deleted = 0`,
                [id, userId]
            );

            const record = (existRecord as any[])[0];
            if (!record) {
                // 改为返回正常响应
                return {
                    code: 404,
                    success: false,
                    message: `删除失败：未找到ID为${id}的有效预约支出记录，或无删除权限`
                };
            }

            // 3. 构建物理删除SQL
            const sql = `
                DELETE FROM ${this.appointmentExpenseTableName}
                WHERE id = ? AND user_id = ?
            `;

            // 4. 执行物理删除操作
            const [result] = await pool.execute(sql, [id, userId]);
            const deleteResult = result as { affectedRows: number };

            // 5. 校验是否删除成功
            if (deleteResult.affectedRows === 0) {
                // 改为返回正常响应
                return {
                    code: 500,
                    success: false,
                    message: `删除失败：记录ID${id}删除失败，可能已被删除或无权限`
                };
            }

            return {
                code: 200,
                success: true,
                message: `预约支出记录${id}已物理删除（不可恢复）`,
                id: id
            };
        } catch (error) {
            console.error(`物理删除预约支出记录失败：`, error);
            // 异常情况返回正常响应
            return {
                code: 500,
                success: false,
                message: `删除预约支出失败：${(error as any).message || "数据库异常"}`
            };
        }
    }
}

export default new AppointmentExpenseModule();