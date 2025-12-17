export interface BookDbSchema {
    id?: number;
    uuid?: string;
    user_id: number;
    name: string;
    type: number;
    currency: string;
    description: string;
    is_default?: number;
    is_active?: number;
    created_at?: Date;
    updated_at?: Date;
    deleted_at?: Date;
}

