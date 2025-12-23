// @ts-ignore
import authModel from "../../modules/miniProgram/AuthModule"
import {formatDate} from "../../utils/date";
import jwt from 'jsonwebtoken';
import HttpError from '../../utils/HttpError';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'; // 生产环境需更换为强密钥


/**
 * 手机号注册登陆
 * @param req
 * @param res
 */
export const loginByPhoneService = async (req: Request, res: Response) => {

    /**
     * 手机号登录核心逻辑
     * - 存在用户：校验激活状态 → 更新登录时间 → 返回用户信息+token
     * - 不存在用户：自动注册 → 返回新用户信息+token
     */
        // @ts-ignore
    const {phone} = req.body
    // 1. 手机号格式化（防呆：即使入参是字符串，也做trim和格式校验）
    const phoneStr = phone.trim();
    if (!/^1[3-9]\d{9}$/.test(phoneStr)) {
        // throw new Error("手机号格式不正确，请输入11位有效手机号");
        throw new HttpError(`手机号格式不正确，请输入11位有效手机号`, 403);
    }
    // 2. 查询用户是否存在
    const existingUser = await authModel.findByPhone(phoneStr);

    // 3. 存在用户：校验状态 + 更新登录时间
    if (existingUser) {
        // 用枚举替代数字，简化条件判断（核心优化点）
        switch (existingUser.is_active) {
            case 0: // 0-禁用
                throw new HttpError(`账户未激活，无法登录`, 403);
            case 2: // 2-注销
                throw new HttpError(`账户已注销，无法登录`, 403);
            case 1: // 1-正常（核心分支）
                // 3-1.更新最后登录时间
                await authModel.updateLastLogin(existingUser.id!);
                // 3-2.格式化用户信息（隐藏敏感字段）
                const safeUser = authModel.formatSafeUser(existingUser);
                // 3-3.生成Token
                const token = authModel.generateToken(safeUser);
                return {token};
            default:
                throw new HttpError(`账户状态异常，请联系管理员`, 500);
        }
    }
    // 4. 用户不存在： 创建新用户
    try {
        const token = await authModel.createUser(phone);
        return {token}
    }catch (error) {
        // @ts-ignore
        res.status(err.status).json({
            // @ts-ignore
            code: err.status,
            // @ts-ignore
            message: err.message
        })
    }
}

/**
 * 通过用户 ID 查询用户信息（用于 Token 解析后的信息获取）
 * @returns 安全的用户信息（不含敏感字段）
 * @param authHeader
 */
export const userInfoService = (authHeader: string) => {
    if (!authHeader) {
        console.warn('未在请求头中找到 Authorization 字段');
        throw new Error('请在请求头中提供 Token（格式：Authorization: Bearer <token>）');
    }
    // 3. 验证格式是否为 Bearer <token>
    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
        console.warn('Authorization 格式错误，应为 "Bearer <token>"');
        throw new Error('Token 格式错误，请使用：Bearer <token>');
    }

    // 4. 验证 Token 有效性并解析用户信息
    const decoded = jwt.verify(token, JWT_SECRET)
    // @ts-ignore
    const formattedUser = {...decoded};
    formattedUser.last_login_at = formatDate(formattedUser.last_login_at);
    formattedUser.created_at = formatDate(formattedUser.created_at);
    formattedUser.updated_at = formatDate(formattedUser.updated_at);

    // 额外：如果需要格式化时间戳（iat/exp），可以转换为Date对象再格式化
    // formattedUser.iat = formatDate(new Date(formattedUser.iat * 1000)); // 秒转毫秒
    // formattedUser.exp = formatDate(new Date(formattedUser.exp * 1000));
    return formattedUser
};
