import type {Request, Response} from "express";
import accountCategoryModule from "../../modules/miniProgram/AccountCategoryModule.ts";

export const accountCategoryCreateService = async (data: any) => {
    // @ts-ignore
    const {userId} = data
    let result = await accountCategoryModule.create(userId);
    return result
}
export const accountCategoryListService = async (req: Request,res:Response) => {
    try {
        const {userId, page, pageSize,parentId} = req.body

        return  await accountCategoryModule.accountList(userId,page, pageSize,parentId);

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