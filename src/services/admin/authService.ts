// @ts-ignore
import authModel from "../../modules/admin/AuthModule";
import { formatDate } from "../../utils/date";
import jwt from "jsonwebtoken";
import HttpError from "../../utils/HttpError";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"; // 生产环境需更换为强密钥

/**
 * 手机号注册登陆
 * @param req
 * @param res
 */
export const loginByAccountService = async (req: Request, res: Response) => {
    /**
     * 手机号登录核心逻辑
     * - 存在用户：校验激活状态 → 更新登录时间 → 返回用户信息+token
     * - 不存在用户：自动注册 → 返回新用户信息+token
     */
        // @ts-ignore
    const {username,password,captcha} = req.body;

    // const user = await authModel.findOne(username, selectAccount);
    // if (!user) return { success: false, message: '账号不存在' };
    // 4. 用户不存在： 创建新用户
    try {
        const token = await authModel.login(username,password,captcha);
        return token
    } catch (error) {
        // @ts-ignore
        res.status(err.status).json({
            // @ts-ignore
            code: err.status,
            // @ts-ignore
            message: err.message,
        });
    }
};

/**
 * 通过用户 ID 查询用户信息（用于 Token 解析后的信息获取）
 * @returns 安全的用户信息（不含敏感字段）
 * @param authHeader
 */
export const userInfoService = (authHeader: string) => {
    if (!authHeader) {
        console.warn("未在请求头中找到 Authorization 字段");
        throw new Error(
            "请在请求头中提供 Token（格式：Authorization: Bearer <token>）"
        );
    }
    // 3. 验证格式是否为 Bearer <token>
    const [bearer, token] = authHeader.split(" ");
    if (bearer !== "Bearer" || !token) {
        console.warn('Authorization 格式错误，应为 "Bearer <token>"');
        throw new Error("Token 格式错误，请使用：Bearer <token>");
    }

    // 4. 验证 Token 有效性并解析用户信息
    const decoded = jwt.verify(token, JWT_SECRET);
    // @ts-ignore
    const formattedUser = { ...decoded };
    formattedUser.last_login_at = formatDate(formattedUser.last_login_at);
    formattedUser.created_at = formatDate(formattedUser.created_at);
    formattedUser.updated_at = formatDate(formattedUser.updated_at);

    // 额外：如果需要格式化时间戳（iat/exp），可以转换为Date对象再格式化
    // formattedUser.iat = formatDate(new Date(formattedUser.iat * 1000)); // 秒转毫秒
    // formattedUser.exp = formatDate(new Date(formattedUser.exp * 1000));
    return formattedUser;
};
