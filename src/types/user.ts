// src/types/user.ts
export interface UserDbSchema {
    id?: number;
    username: string;
    password: string;
    is_active: number;
    uuid?: string;
    email?: string | null;
    phone?: string | null;
    nickname?: string;
    default_book_id?: number | null;
    last_login_at?: string | null;
    created_at?: string;
    updated_at?: string;
    deleted_at?: string | null;
    birthday?: string | null;
    avatar?: string;
    gender?: number;
    gender_text:string
}