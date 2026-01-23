// @ts-ignore
<<<<<<< HEAD
import userModel from "../../modules/miniProgram/UserModule.ts"
=======
import userModel from "../../modules/miniProgram/UserModule"
>>>>>>> 4d9c73e (🐛 修复打包)

export const userInfoService = (req: Request, res: Response) => {
    // @ts-ignore
    const {userId} = req.body;
    return userModel.info(userId)
}