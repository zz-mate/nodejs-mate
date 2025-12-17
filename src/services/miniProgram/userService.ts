// @ts-ignore
import userModel from "../../modules/miniProgram/UserModule.ts"

export const userInfoService = (req: Request, res: Response) => {
    // @ts-ignore
    const {userId} = req.body;
    return userModel.info(userId)
}