
type TimeRangeType = "week" | "day" | "month" | "year" | "custom";

export interface BudgetCategoryItem {
    category_id: number | string; // 分类ID，支持数字/字符串
    category_amount: number;      // 分类预算金额
    category_name?: string;       // 可选：分类名称（前端传参包含，建议保留）
}
export interface BudgetDbSchema {
    id?: number;
    user_id: number;

    book_id: number;
    amount: number;
    actual_amount: number;
    remaining_percent: BudgetCategoryItem[];
    categories?: string[];
    cycle_type: TimeRangeType;
    cycle_start: string;
    cycle_end: string;
    sort_order: string;
    is_active?: number;
    created_at?: Date;
    updated_at?: Date;
}

