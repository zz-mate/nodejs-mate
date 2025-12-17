import type {Request, Response} from "express";
import bookModule from "../../modules/miniProgram/BookModule";

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