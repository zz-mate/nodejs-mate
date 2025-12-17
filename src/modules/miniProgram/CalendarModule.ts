import pool from '../../db/index.ts';
import {formatAmount,parseJsonToArray} from '../../utils/tools.ts'

class CalendarModule {

    billTableName = 'mate_bill';

// 定义返回数据结构接口
//     interface BillCalendarMonthResponse {
//     income: number[];    // 收入数组（索引对应日期-1，值为当日收入金额）
//     expense: number[];   // 支出数组（索引对应日期-1，值为当日支出金额）
//     year: number;        // 年份
//     month: number;       // 月份
//     days: number;        // 当月总天数
// }

// 金额格式化工具函数（保留两位小数）


    /**
     * 查询指定用户指定日期/月份的账单（关联分类、账本表，支持分页，返回结构化对象）
     * @param userId 用户ID
     * @param date 日期：YYYY-MM-DD（当日）/ YYYY-MM（当月）/ YYYY/MM/DD（自动转换）
     * @param page 页码（默认1）
     * @param pageSize 每页条数（默认20，最大100）
     * @returns 账单列表+分页信息（category/book 为独立对象）
     */
    async calendarMonth(
        userId: number,
        date: string,
        page: number = 1,
        pageSize: number = 20
    ): Promise<{
        list: any[];
        total: number;
        page: number;
        pageSize: number;
        totalIncome: string; // 新增：总收入
        totalExpense: string; // 新增：总支出
    }> {
        // 1. 基础参数校验
        if (!userId || !date) {
            console.warn('calendarMonth 参数缺失：', { userId, date });
            return { list: [], total: 0, page, pageSize, totalIncome: "0.00", totalExpense: "0.00" };
        }

        // 2. 分页参数处理（防非法值）
        const validPageNum = Math.max(1, Number(page) || 1);
        const validPageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
        const offset = (validPageNum - 1) * validPageSize;

        try {
            // 3. 统一日期格式（处理 / 转 -）
            const normalizedDate = date.replace(/\//g, '-');

            // 4. 构建时间条件和查询参数
            let timeCondition = '';
            const baseParams: any[] = [userId];

            // 匹配 YYYY-MM-DD（精确到日）
            if (normalizedDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                timeCondition = 'DATE(b.bill_time) = ?';
                baseParams.push(normalizedDate);
            }
            // 匹配 YYYY-MM（查询整月）
            else if (normalizedDate.match(/^\d{4}-\d{2}$/)) {
                timeCondition = 'DATE_FORMAT(b.bill_time, "%Y-%m") = ?';
                baseParams.push(normalizedDate);
            }
            // 日期格式错误
            else {
                console.warn('日期格式错误，支持 YYYY-MM-DD 或 YYYY-MM：', date);
                return { list: [], total: 0, page: validPageNum, pageSize: validPageSize, totalIncome: "0.00", totalExpense: "0.00" };
            }

            // 5. 构建 WHERE 条件
            const whereConditions = [
                'b.user_id = ?',
                timeCondition,
                'b.is_deleted = 0'
            ];

            // 6. 先查询总条数 + 总收入/总支出（一次查询提升性能）
            const countAndSumSql = `
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN b.type = '1' THEN b.amount ELSE 0 END) AS totalIncome,
                    SUM(CASE WHEN b.type = '2' THEN b.amount ELSE 0 END) AS totalExpense
                FROM ${this.billTableName} b
                WHERE ${whereConditions.join(' AND ')}
            `;
            const [countSumResult] = await pool.execute(countAndSumSql, baseParams);
            const total = (countSumResult as any[])[0]?.total || 0;
            // 处理数值为 null 的情况，确保返回 0
            const totalIncome = formatAmount((countSumResult as any[])[0]?.totalIncome) || "0.00";
            const totalExpense = formatAmount((countSumResult as any[])[0]?.totalExpense) || "0.00";

            // 7. 查询账单列表（关联分类、账本表，保留原始字段）
            const listSql = `
            SELECT
                b.id, b.user_id, b.amount, b.type, b.currency,
                DATE_FORMAT(b.bill_time, '%H:%i') AS bill_time_hm,
                DATE_FORMAT(b.bill_time, '%Y')  AS bill_year,
                DATE_FORMAT(b.bill_time, '%m')  AS bill_month,
                DATE_FORMAT(b.bill_time, '%d')  AS bill_day,
                b.tags, b.remark, b.category_id, b.book_id,
                -- 转换时区并格式化创建/更新时间（UTC→东八区）
                DATE_FORMAT(CONVERT_TZ(b.created_at, '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s') AS created_at,
                DATE_FORMAT(CONVERT_TZ(b.updated_at, '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s') AS updated_at,
                -- 分类表字段（带前缀）
                c.id AS c_id, c.name AS c_name, c.icon AS c_icon, c.type AS c_type,
                -- 账本表字段（带前缀）
                bo.id AS bo_id, bo.name AS bo_name, bo.is_default AS bo_is_default
            FROM ${this.billTableName} b
                     LEFT JOIN mate_category c ON b.category_id = c.id
                     LEFT JOIN mate_book bo ON b.book_id = bo.id
            WHERE ${whereConditions.join(' AND ')}
            ORDER BY b.bill_time DESC
                LIMIT ?, ?
        `;

            // 拼接分页参数
            const queryParams = [...baseParams, offset.toString(), validPageSize.toString()];
            const [listRows] = await pool.execute(listSql, queryParams);

            // 8. 格式化返回数据：将分类/账本字段封装为独立对象
            const formattedRows = (listRows as any[]).map(item => ({
                // 账单基础字段
                id: item.id,
                user_id: item.user_id,
                amount: item.amount,
                type: item.type,
                currency: item.currency,
                bill_time: item.bill_time_hm,
                tags:parseJsonToArray(item.tags),
                remark: item.remark,
                category_id: item.category_id,
                book_id: item.book_id,
                created_at: item.created_at,
                updated_at: item.updated_at,
                // 分类信息（封装为对象，空值时返回空对象）
                category: item.c_id ? {
                    id: item.c_id,
                    name: item.c_name,
                    icon: item.c_icon,
                    type: item.c_type
                } : {},
                // 账本信息（封装为对象，空值时返回空对象）
                book: item.bo_id ? {
                    id: item.bo_id,
                    name: item.bo_name,
                    is_default: item.bo_is_default
                } : {}
            }));

            // 9. 返回结构化结果（包含总收入、总支出）
            return {
                list: formattedRows,
                total,
                page: validPageNum,
                pageSize: validPageSize,
                // @ts-ignore
                totalIncome, // 新增返回
                // @ts-ignore
                totalExpense // 新增返回
            };

        } catch (error: any) {
            console.error('calendarMonth 查询失败：', {
                userId,
                date,
                page,
                pageSize,
                error: error.message,
                stack: error.stack
            });
            return { list: [], total: 0, page: validPageNum, pageSize: validPageSize, totalIncome: "0.00", totalExpense: "0.00" };
        }
    }
}

export default new CalendarModule();