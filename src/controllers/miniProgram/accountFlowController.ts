import type { Request, Response } from "express";
// @ts-ignore
import { accountFlowListService } from "../../services/miniProgram/accountFlowService";
export const list = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        let result = await accountFlowListService(req,res);
        res.status(200).json({
            code: 200,
            message: "ok",
            data: result,
        });
    } catch (error) {
        res.status(403).json({ code: 403, message: "" });
    }
};
