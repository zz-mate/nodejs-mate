import type {Request, Response} from "express";
// @ts-ignore
import {billListService} from "../../../services/admin/bills/billService";

export const list = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        let result = await billListService(req, res);
        res.status(200).json(
            result
        );
    } catch (error) {

        res.status(403).json({code: 403, message: error});
    }
};
