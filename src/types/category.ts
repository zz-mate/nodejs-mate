export interface CategoryDbSchema {
    id?: number;
    category_id ?: number;
    user_id?: number | null; // 允许为null（无用户归属）
    book_id?: number | null;
    parent_id: number;
    name: string;
    type: 1 | 2 | 3;
    icon: string;
    color: string;
    sort_order: number;
    is_system: 0 | 1;
    is_active: 0 | 1;
    created_at: string;
    updated_at: string;
    children?: CategoryDbSchema[];// 新增子分类字段（树形结构）
}