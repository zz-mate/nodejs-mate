import pool from "../../db";

// 分类信息
interface Category {
    name: string;
    icon: string;
    type: number;
    id: number;
}

// 账本信息
interface Book {
    id: number;
    name: string;
    is_default: number;
}

// 单条账单详情
interface BillDetail {
    id: number;
    user_id: number;
    account_id: number; // 新增账户ID字段
    amount: string;
    type: number;
    currency: string;
    full_bill_time: string;
    bill_time: string;
    remark: string;
    tags: any[];
    image_list: any[];
    created_at: string;
    updated_at: string;
    singleProgress: number;
    category: Category;
    book: Book;
    status: boolean;
}

// 每日账单汇总 + 明细
interface DayBill {
    year: string;
    month: string;
    day: string;
    weekday: string;
    name: string;
    incomeMoney: string;
    expendMoney: string;
    surplusMoney: string;
    incomeProgress: number;
    expendProgress: number;
    surplusProgress: number;
    surplusDirection: string;
    list: BillDetail[];
}

// 每月账单汇总 + 每日明细
interface MonthBill {
    year: string;
    month: string;
    name: string;
    incomeMoney: string;
    expendMoney: string;
    surplusMoney: string;
    incomeProgress: number;
    expendProgress: number;
    surplusProgress: number;
    surplusDirection: string;
    children: DayBill[];
}

// 列表数据结构
interface BillList {
    year: number;
    month: number;
    listType: "month";
    dataList: MonthBill[];
}

// 汇总统计信息
interface BillSummary {
    totalIncome: string;
    totalExpend: string;
    totalSurplus: string;
    listIncome: string;
    listExpend: string;
    listSurplus: string;
    currentPageIncome: string;
    currentPageExpend: string;
    currentPageSurplus: string;
    totalIncomeCount: number;
    totalExpendCount: number;
    totalBillCount: number;
    listIncomeCount: number;
    listExpendCount: number;
    listTotalCount: number;
    currentPageIncomeCount: number;
    currentPageExpendCount: number;
    currentPageTotalCount: number;
    year: number | null;
    month: number | null;
    start_year: number;
    start_month: number;
    end_year: number;
    end_month: number;
    queryDimension: string;
    surplusDirection: string;
    currentPageSurplusProgress: number;
    incomeProgress: number;
    expendProgress: number;
    surplusProgress: number;
    start_time: string;
    end_time: string;
    progressDesc: string;
    filterType: string;
    filterCategoryId: string;
    emptyTip: string;
}

// 分页信息
interface Pagination {
    total: number;
    page: number;
    pageSize: number;
    totalPage: number;
}

// 最终返回数据结构
interface BillResponse {
    code: number;
    list: BillList;
    summary: BillSummary;
    pagination: Pagination;
}

class AccountFlowModule {
    private billTableName = "mate_bill";
    private categoryTableName = "mate_category";
    private accountFlowTableName = "mate_account_flow";
    private accountTableName = "mate_account";

    /**
     * 格式化金额为保留两位小数的字符串
     */
    private formatAmount(amount: number): string {
        return amount.toFixed(2);
    }

    /**
     * 获取星期几
     */
    private getWeekday(date: Date): string {
        const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
        return weekdays[date.getDay()];
    }

    /**
     * 按 年→月→日 三级分组账单数据
     */
    private groupBillsByYearMonthDay(bills: any[]): MonthBill[] {
        // 1. 构建 年-月-日 的 Map 层级结构
        const yearMonthMap = new Map<string, Map<string, Map<string, any[]>>>();

        bills.forEach((bill) => {
            const billTime = new Date(bill.full_bill_time);
            const year = billTime.getFullYear().toString();
            const month = (billTime.getMonth() + 1).toString().padStart(2, "0");
            const day = billTime.getDate().toString().padStart(2, "0");
            const dateKey = `${year}-${month}-${day}`;

            // 初始化层级 Map
            if (!yearMonthMap.has(year)) {
                yearMonthMap.set(year, new Map());
            }
            const monthMap = yearMonthMap.get(year)!;

            if (!monthMap.has(month)) {
                monthMap.set(month, new Map());
            }
            const dayMap = monthMap.get(month)!;

            if (!dayMap.has(day)) {
                dayMap.set(day, []);
            }
            dayMap.get(day)!.push(bill);
        });

        // 2. 转换为最终的三级数组结构
        const monthBills: MonthBill[] = [];
        yearMonthMap.forEach((monthMap, year) => {
            monthMap.forEach((dayMap, month) => {
                // 计算月维度汇总
                let monthIncome = 0;
                let monthExpend = 0;
                const dayBills: DayBill[] = [];

                dayMap.forEach((bills, day) => {
                    // 计算日维度汇总
                    let dayIncome = 0;
                    let dayExpend = 0;
                    bills.forEach((bill) => {
                        const amount = Number(bill.amount);
                        if (bill.type === 1) {
                            dayIncome += amount;
                            monthIncome += amount;
                        } else {
                            dayExpend += Math.abs(amount);
                            monthExpend += Math.abs(amount);
                        }
                    });
                    const daySurplus = dayIncome - dayExpend;

                    // 组装每日账单数据
                    const billTime = new Date(`${year}-${month}-${day}`);
                    dayBills.push({
                        year,
                        month,
                        day,
                        weekday: this.getWeekday(billTime),
                        name: `${month}月${day}日`,
                        incomeMoney: this.formatAmount(dayIncome),
                        expendMoney: this.formatAmount(dayExpend),
                        surplusMoney: this.formatAmount(daySurplus),
                        incomeProgress: 0,
                        expendProgress: 0,
                        surplusProgress: 0,
                        surplusDirection: daySurplus >= 0 ? "盈余" : "赤字",
                        list: bills,
                    });
                });

                // 计算月维度进度（基准为月支出最大值，可根据业务调整）
                const monthSurplus = monthIncome - monthExpend;
                const maxMonthExpend = monthExpend || 1;
                const monthIncomeProgress = (monthIncome / maxMonthExpend) * 100;
                const monthExpendProgress = (monthExpend / maxMonthExpend) * 100;

                // 组装月账单数据
                monthBills.push({
                    year,
                    month,
                    name: `${year}年${month}月`,
                    incomeMoney: this.formatAmount(monthIncome),
                    expendMoney: this.formatAmount(monthExpend),
                    surplusMoney: this.formatAmount(monthSurplus),
                    incomeProgress: monthIncomeProgress,
                    expendProgress: monthExpendProgress,
                    surplusProgress: monthExpendProgress,
                    surplusDirection: monthSurplus >= 0 ? "盈余" : "赤字",
                    children: dayBills.sort((a, b) => Number(b.day) - Number(a.day)), // 日期降序
                });
            });
        });

        return monthBills;
    }

    /**
     * 计算汇总统计信息
     */
    private calculateSummary(
        allBills: any[],
        pageBills: any[],
        startYear: number,
        startMonth: number,
        endYear: number,
        endMonth: number
    ): BillSummary {
        // 全量账单汇总
        const totalIncome = allBills
            .filter((b) => b.type === 1)
            .reduce((sum, b) => sum + Number(b.amount), 0);
        const totalExpend = allBills
            .filter((b) => b.type === 2)
            .reduce((sum, b) => sum + Math.abs(Number(b.amount)), 0);
        const totalSurplus = totalIncome - totalExpend;

        // 当前页账单汇总
        const currentPageIncome = pageBills
            .filter((b) => b.type === 1)
            .reduce((sum, b) => sum + Number(b.amount), 0);
        const currentPageExpend = pageBills
            .filter((b) => b.type === 2)
            .reduce((sum, b) => sum + Math.abs(Number(b.amount)), 0);
        const currentPageSurplus = currentPageIncome - currentPageExpend;

        // 计数统计
        const totalIncomeCount = allBills.filter((b) => b.type === 1).length;
        const totalExpendCount = allBills.filter((b) => b.type === 2).length;
        const totalBillCount = allBills.length;
        const currentPageIncomeCount = pageBills.filter((b) => b.type === 1).length;
        const currentPageExpendCount = pageBills.filter((b) => b.type === 2).length;
        const currentPageTotalCount = pageBills.length;

        // 进度基准：取全量支出最大值
        const maxExpend = totalExpend || 1;
        const progressDesc = `进度基准：支出最大值(${this.formatAmount(maxExpend)})=100%`;

        return {
            totalIncome: this.formatAmount(totalIncome),
            totalExpend: this.formatAmount(totalExpend),
            totalSurplus: this.formatAmount(totalSurplus),
            listIncome: this.formatAmount(totalIncome),
            listExpend: this.formatAmount(totalExpend),
            listSurplus: this.formatAmount(totalSurplus),
            currentPageIncome: this.formatAmount(currentPageIncome),
            currentPageExpend: this.formatAmount(currentPageExpend),
            currentPageSurplus: this.formatAmount(currentPageSurplus),
            totalIncomeCount,
            totalExpendCount,
            totalBillCount,
            listIncomeCount: totalIncomeCount,
            listExpendCount: totalExpendCount,
            listTotalCount: totalBillCount,
            currentPageIncomeCount,
            currentPageExpendCount,
            currentPageTotalCount,
            year: null,
            month: null,
            start_year: startYear,
            start_month: startMonth,
            end_year: endYear,
            end_month: endMonth,
            queryDimension: "month",
            surplusDirection: totalSurplus >= 0 ? "盈余" : "赤字",
            currentPageSurplusProgress: (currentPageSurplus / maxExpend) * 100,
            incomeProgress: (totalIncome / maxExpend) * 100,
            expendProgress: (totalExpend / maxExpend) * 100,
            surplusProgress: (totalSurplus / maxExpend) * 100,
            start_time: `${startYear}-${startMonth.toString().padStart(2, "0")}`,
            end_time: `${endYear}-${endMonth.toString().padStart(2, "0")}`,
            progressDesc,
            filterType: "all",
            filterCategoryId: "all",
            emptyTip: totalBillCount === 0 ? "当前筛选条件下无账单数据" : "",
        };
    }

    /**
     * 获取指定账户的账单列表（按年→月→日三级结构返回）
     * @param userId 用户ID
     * @param accountId 账户ID（新增参数）
     * @param page 页码
     * @param pageSize 每页条数
     * @param start_time 开始时间 YYYY-MM
     * @param end_time 结束时间 YYYY-MM
     */
    async findByAccountId(
        userId: number,
        accountId: number, // 新增账户ID入参
        page?: number,
        pageSize?: number,
        start_time?: string,
        end_time?: string
    ): Promise<BillResponse> {
        try {
            // 1. 参数处理
            const currentPage = page || 1;
            const currentPageSize = pageSize || 100;
            const offset = (currentPage - 1) * currentPageSize;

            // 解析年月范围
            const now = new Date();
            const defaultYear = now.getFullYear();
            const defaultMonth = now.getMonth() + 1;
            const [startYear = defaultYear, startMonth = defaultMonth] = start_time
                ? start_time.split("-").map(Number)
                : [defaultYear, defaultMonth];
            const [endYear = defaultYear, endMonth = defaultMonth] = end_time
                ? end_time.split("-").map(Number)
                : [defaultYear, defaultMonth];

            // 2. 构建SQL查询条件：新增 account_id = ? 筛选
            const timeWhere = `
        YEAR(b.bill_time) BETWEEN ? AND ? 
        AND MONTH(b.bill_time) BETWEEN ? AND ?
      `;
            // 核心修改：添加 account_id 筛选条件
            const queryWhere = `b.user_id = ? AND b.account_id = ? AND b.is_deleted = 0 AND ${timeWhere}`;
            const queryParams = [userId, accountId, startYear, endYear, startMonth, endMonth];

            // 3. 查询全量账单（关联分类、账本）
            const allBillsSql = `
                SELECT
                    b.id, b.user_id, b.account_id, b.amount, b.type, b.currency,
                    b.bill_time AS full_bill_time,
                    DATE_FORMAT(b.bill_time, '%H:%i') AS bill_time,
                    b.remark, b.tags, b.image_list, b.created_at, b.updated_at,
                    c.id AS category_id, c.name AS category_name, c.icon AS category_icon, c.type AS category_type,
                    book.id AS book_id, book.name AS book_name, book.is_default
                FROM ${this.billTableName} b
                         LEFT JOIN ${this.categoryTableName} c ON b.category_id = c.id
                         LEFT JOIN mate_book book ON b.book_id = book.id
                WHERE ${queryWhere}
                ORDER BY b.bill_time DESC
            `;

            // 4. 执行全量查询和分页查询
            const [allBillsResult] = await pool.query(allBillsSql, queryParams);
            const allBills = allBillsResult || [];

            const pageBillsSql = `${allBillsSql} LIMIT ? OFFSET ?`;
            const pageParams = [...queryParams, currentPageSize, offset];
            const [pageBillsResult] = await pool.query(pageBillsSql, pageParams);
            const pageBills = pageBillsResult || [];

            // 5. 格式化账单数据（补充分类、账本结构，新增account_id）
            const formatBills = (bills: any[]) => {
                return bills.map((bill) => ({
                    id: bill.id,
                    user_id: bill.user_id,
                    account_id: bill.account_id, // 新增账户ID返回
                    amount: bill.amount,
                    type: bill.type,
                    currency: bill.currency,
                    full_bill_time: bill.full_bill_time,
                    bill_time: bill.bill_time,
                    remark: bill.remark,
                    tags: bill.tags ? bill.tags.split(",") : [],
                    image_list: bill.image_list ? bill.image_list.split(",") : [],
                    created_at: bill.created_at,
                    updated_at: bill.updated_at,
                    singleProgress: 0, // 可根据业务逻辑计算
                    category: {
                        id: bill.category_id,
                        name: bill.category_name,
                        icon: bill.category_icon,
                        type: bill.category_type,
                    },
                    book: {
                        id: bill.book_id,
                        name: bill.book_name,
                        is_default: bill.is_default,
                    },
                    status: true,
                }));
            };

            // @ts-ignore
            const formattedAllBills = formatBills(allBills);
            // @ts-ignore
            const formattedPageBills = formatBills(pageBills);

            // 6. 三级分组 + 汇总计算
            const dataList = this.groupBillsByYearMonthDay(formattedPageBills);
            const summary = this.calculateSummary(formattedAllBills, formattedPageBills, startYear, startMonth, endYear, endMonth);
            const pagination = {
                total: formattedAllBills.length,
                page: currentPage,
                pageSize: currentPageSize,
                totalPage: Math.ceil(formattedAllBills.length / currentPageSize),
            };

            // 7. 组装最终返回数据
            return {
                code: 200,
                list: {
                    year: startYear,
                    month: startMonth,
                    listType: "month",
                    dataList,
                },
                summary,
                pagination,
            };
        } catch (error) {
            console.error("获取账户账单列表失败：", error);
            // 异常返回空结构
            const startYear = start_time ? Number(start_time.split("-")[0]) : new Date().getFullYear();
            const startMonth = start_time ? Number(start_time.split("-")[1]) : new Date().getMonth() + 1;
            return {
                code: 200,
                list: {
                    year: startYear,
                    month: startMonth,
                    listType: "month",
                    dataList: [],
                },
                summary: {
                    totalIncome: "0.00",
                    totalExpend: "0.00",
                    totalSurplus: "0.00",
                    listIncome: "0.00",
                    listExpend: "0.00",
                    listSurplus: "0.00",
                    currentPageIncome: "0.00",
                    currentPageExpend: "0.00",
                    currentPageSurplus: "0.00",
                    totalIncomeCount: 0,
                    totalExpendCount: 0,
                    totalBillCount: 0,
                    listIncomeCount: 0,
                    listExpendCount: 0,
                    listTotalCount: 0,
                    currentPageIncomeCount: 0,
                    currentPageExpendCount: 0,
                    currentPageTotalCount: 0,
                    year: null,
                    month: null,
                    start_year: startYear,
                    start_month: startMonth,
                    end_year: startYear,
                    end_month: startMonth,
                    queryDimension: "month",
                    surplusDirection: "盈余",
                    currentPageSurplusProgress: 0,
                    incomeProgress: 0,
                    expendProgress: 0,
                    surplusProgress: 0,
                    start_time: `${startYear}-${startMonth.toString().padStart(2, "0")}`,
                    end_time: `${startYear}-${startMonth.toString().padStart(2, "0")}`,
                    progressDesc: "进度基准：支出最大值(0.00)=100%",
                    filterType: "all",
                    filterCategoryId: "all",
                    emptyTip: "查询异常，暂无账单数据",
                },
                pagination: {
                    total: 0,
                    page: page || 1,
                    pageSize: pageSize || 100,
                    totalPage: 0,
                },
            };
        }
    }
}

export default new AccountFlowModule();