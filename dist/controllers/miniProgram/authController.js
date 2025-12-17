// @ts-ignore
import { loginByPhoneService, userInfoService } from "../../services/miniProgram/authService.ts";
/**
 * 手机号注册登陆
 * @param req
 * @param res
 */
export const loginByPhone = async (req, res) => {
    try {
        // @ts-ignore
        let { phone } = req.body;
        let result = await loginByPhoneService(phone);
        // @ts-ignore
        res.status(200).json({
            code: 200,
            message: "ok",
            data: result
        });
    }
    catch (error) {
    }
};
/**
 * 通过Token 获取用户信息
 */
export const userInfo = async (req, res) => {
    try {
        // 1. 从请求头获取 Authorization 字段
        // @ts-ignore
        const authHeader = req.headers['authorization'];
        let user = userInfoService(authHeader);
        // @ts-ignore
        res.status(200).json({
            code: 200,
            message: '获取用户信息成功',
            data: user,
        });
    }
    catch (error) {
        // @ts-ignore
        res.status(401).json({ code: 401, message: error.message });
    }
};
