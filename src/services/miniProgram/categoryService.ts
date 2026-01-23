import type {Request, Response} from "express";
<<<<<<< HEAD
import categoryModule from "../../modules/miniProgram/CategoryModule.ts";
=======
import categoryModule from "../../modules/miniProgram/CategoryModule";
>>>>>>> 4d9c73e (🐛 修复打包)

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