export interface BillDbSchema {
    billId?: number;
    uuid?: string;
    user_id: number;
    book_id: number;
    account_id?: number;
    consume_user_id: number;
    amount: number;
    address?:string;
    latitude?:string;
    longitude?:string;
    type: number;
    category_id: number;
    image_list?: string[];
    tags?: string[];
    currency: string;
    bill_time: string;
    remark?: string;
    is_deleted?: number;
    created_at?: Date;
    updated_at?: Date;
}

