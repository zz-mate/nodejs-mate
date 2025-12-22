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


/** 二维码配置类型 */
export interface QRCodeConfig {
    width?: number;          // 二维码宽度（默认250）
    margin?: number;         // 边距（默认1）
    logoPath?: string;       // Logo路径（可选）
    color?: {
        dark: string;          // 深色块（默认#2E86AB）
        light: string;         // 浅色块（默认#F8F9FA）
    };
}

/** 二维码内容类型（嵌入用户信息） */
export interface UserQRContent {
    type: 'user_profile';
    user_id: number;
    nickname: string;
    level?: number;
    exp?: number;
    shareUrl?: string;        // 用户专属链接
    timestamp?: number;       // 生成时间戳
}