export interface AccountCategoryDbSchema {
    id?: number;
    user_id: number | null;
    parent_id: number;
    name: string;
    icon: string;
    color: string;
    type: number;
    sort_order: number;
    is_system: 0 | 1;
    is_active: 0 | 1;
    created_at: string;
    updated_at: string;
}

export interface AccountDbSchema {
    id: number;
    user_id: number | null;
    // 账户分类关联字段
    // category_id: number;
    // category_name: string;
    // category_parent_id: number;
    // 账户自身字段
    parent_account_id: number | null;
    account_id: number | null;
    name: string;
    type: number;
    icon: string;
    color: string;
    sort_order: number;
    is_system: 0 | 1;
    is_active: 0 | 1;
    balance: number | string;
    actual_amount: number | string;
    remaining_amount: number | string;
    card_no: string;
    bank_name: string;
    remark: string;
    created_at: string;
    updated_at: string;
}