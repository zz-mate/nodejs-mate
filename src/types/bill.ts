export interface BillDbSchema {
    id?: number;
    uuid?: string;
    user_id: number;
    book_id: number;
    account_id?: number;
    consume_user_id: number;
    amount: number;
    type: number;
    category_id: number;
    tags?: string[];
    currency: string;
    bill_time: string;
    remark?: string;
    is_deleted?: number;
    created_at?: Date;
    updated_at?: Date;
}

