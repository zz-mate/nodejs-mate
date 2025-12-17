import type {Request, Response} from "express";
import categoryModule from "../../modules/miniProgram/CategoryModule.ts";

export const categoryCreateService = async (data: any) => {
    // @ts-ignore
    const {userId} = data
    let result = await categoryModule.create(userId);
    return result
}
export const categoryListService = async (req: Request,res:Response) => {
    try {
        const {userId, page, pageSize ,type} = req.body

   return  await categoryModule.categoryList(userId,page, pageSize,type);

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