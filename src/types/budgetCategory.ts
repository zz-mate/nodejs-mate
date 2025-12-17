export interface BudgetCategoryDbSchema {
    id?: number;
    user_id: number;
    book_id: number;
    budget_id: number;
    category_id: number;
    category_amount: number;
    category_actual_amount?: number;
    remaining_percent?: number;
    sort_order?: string;
    is_active?: number;
    created_at?: Date;
    updated_at?: Date;
}

