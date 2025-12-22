// @ts-ignore
import userModel from "../../modules/miniProgram/UserModule"

export const userInfoService = (req: Request, res: Response) => {
    // @ts-ignore
    const {userId} = req.body;
    return userModel.info(userId)
}



export const userQrcodeService = (req: Request, res: Response) => {
    // @ts-ignore
    const {userId,config} = req.body;
    return userModel.generateUserQRCodeById(userId,config)
}
