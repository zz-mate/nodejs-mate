import {bookCategoryListService} from "../../services/miniProgram/bookCategoryService";




export const list = async (req: Request, res: Response) => {

    try {
        // @ts-ignore
        let result = await bookCategoryListService(req,res);
        // @ts-ignore
        return res.status(200).json(result);
    } catch (err) {

    }
}