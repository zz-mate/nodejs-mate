// src/utils/tokenUtils.ts
import jwt from 'jsonwebtoken';

// 从环境变量获取密钥（建议在 .env 中配置）
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'; // 生产环境需更换为强密钥
const JWT_EXPIRES_IN = '24h'; // Token 有效期（1小时）

/**
 * 生成 JWT Token
 * @param payload 存储在 Token 中的数据（如用户ID）
 * @returns 生成的 Token 字符串
 */
export const generateToken = (payload: object): string => {
    return jwt.sign(payload, JWT_SECRET, {expiresIn: JWT_EXPIRES_IN});
};

/**
 * 验证 Token 有效性
 * @param token 待验证的 Token 字符串
 * @returns 验证成功返回解码后的 payload，失败返回 null
 */
export const verifyToken = (token: string): any => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null; // 验证失败（过期/无效）
    }
};