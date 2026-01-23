// @ts-ignore
<<<<<<< HEAD
import {loginByPhoneService, userInfoService} from "../../services/miniProgram/authService.ts";
=======
import {loginByPhoneService, userInfoService} from "../../services/miniProgram/authService";
>>>>>>> 4d9c73e (🐛 修复打包)

interface CustomRequest extends Request {
    user?: {
        userId: number;
        username: string;
        phone: string;
    };
}

/**
 * 手机号注册登陆
 * @param req
 * @param res
 */
export const loginByPhone = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        let result = await loginByPhoneService(req,res)
        // @ts-ignore
        res.status(200).json({
            code: 200,
            message: "ok",
            data: result
        })
    } catch (error) {

    }
}
/**
 * 通过Token 获取用户信息
 */
export const userInfo = async (req: CustomRequest, res: Response) => {
    try {
        // 1. 从请求头获取 Authorization 字段
        // @ts-ignore
        const authHeader = req.headers['authorization'];
        let user =  userInfoService(authHeader)
        // @ts-ignore
        res.status(200).json({
            code: 200,
            message: '获取用户信息成功',
            data: user,
        });
    } catch (error) {
        console.log(error);
        // @ts-ignore
        res.status(401).json({code: 401, message: (error as Error).message});
    }
}