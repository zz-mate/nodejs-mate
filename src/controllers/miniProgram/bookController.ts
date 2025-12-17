import {bookInfoService,bookListService} from "../../services/miniProgram/bookService.ts";


export const info = async (req: Request, res: Response) => {

    try {
        // @ts-ignore
        let result = await bookInfoService(req.body);
        // @ts-ignore
        return res.status(200).json(result);
    } catch (err) {

    }
}

export const list = async (req: Request, res: Response) => {

    try {
        // @ts-ignore
        let result = await bookListService(req,res);
        // @ts-ignore
        return res.status(200).json(result);
    } catch (err) {

    }
}