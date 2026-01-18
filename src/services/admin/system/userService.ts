import type { Request, Response } from "express";
// @ts-ignore
import userModule from "../../../modules/admin/system/UserModule";

export const userListService = async (req: Request, res: Response) => {
    let {page=1,pageSize=10} = req.query;
    return await userModule.findAll(+page,+pageSize);
};
