import type {Request, Response} from "express";
// @ts-ignore
import {cateListService,createBookCateService} from "../../../services/admin/books/cateService";

export const list = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        let result = await cateListService(req, res);
        res.status(200).json(
            result
        );
    } catch (error) {

        res.status(403).json({code: 403, message: error});
    }
};
export const create = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        let result = await createBookCateService(req, res);
        res.status(200).json(
            result
        );
    } catch (error) {

        res.status(403).json({code: 403, message: error});
    }
};
