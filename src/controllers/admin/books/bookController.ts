import type {Request, Response} from "express";
// @ts-ignore
import {bookListService} from "../../../services/admin/books/bookService";

export const list = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        let result = await bookListService(req, res);
        res.status(200).json(
            result
        );
    } catch (error) {

        res.status(403).json({code: 403, message: error});
    }
};
