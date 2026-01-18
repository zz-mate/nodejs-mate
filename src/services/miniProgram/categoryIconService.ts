// @ts-ignore
import categoryIconModule from "../../modules/miniProgram/CategoryIconModule";
import type {Request, Response} from "express";

export const categoryIconServiceList = async (req: Request, res: Response) => {
    return categoryIconModule.findAll({
        page: req.body.page,
        pageSize:  req.body.pageSize
    });
};
