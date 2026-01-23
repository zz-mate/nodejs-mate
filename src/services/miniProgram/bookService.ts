import type {Request, Response} from "express";
<<<<<<< HEAD
import bookModule from "../../modules/miniProgram/BookModule.ts";
=======
import bookModule from "../../modules/miniProgram/BookModule";
>>>>>>> 4d9c73e (🐛 修复打包)

export const bookInfoService = async (data: any) => {
    // @ts-ignore
    const {userId, bookId} = data
    let result = await bookModule.bookInfo(userId, bookId);
    return result
}
export const bookListService = async (req: Request,res:Response) => {
    try {
        const {userId, page, pageSize} = req.body
        let result = await bookModule.bookList(userId, page, pageSize);
        return result
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