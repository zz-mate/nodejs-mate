import type {Request, Response} from "express";
<<<<<<< HEAD
import accountModule from "../../modules/miniProgram/AccountModule.ts";
=======
import accountModule from "../../modules/miniProgram/AccountModule";
>>>>>>> 4d9c73e (🐛 修复打包)

export const accountCreateService = async (data: any) => {
    // @ts-ignore
    const {userId} = data
    let result = await accountModule.create(userId);
    return result
}
export const accountListService = async (req: Request,res:Response) => {
    try {
        const {userId, page, pageSize} = req.body

        return  await accountModule.accountList(userId,page, pageSize);

    }catch (err) {
        // @ts-ignore
        res.status(err.status).json({
            // @ts-ignore
            code: err.status,
            // @ts-ignore
            message: err.message
        })
    }
}