

import type {Request, Response} from "express";
import bookCategoryModule from "../../modules/miniProgram/BookCategoryModule";


export const bookCategoryListService = async (req: Request,res:Response) => {
    try {
        const { page, pageSize} = req.body
        console.log("page", page)
        let result = await bookCategoryModule.bookCategoryList(page, pageSize);
        console.log(result);
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