import type { Request, Response } from "express";
// @ts-ignore
import { subscribeList,isSubscribeService } from "../../services/miniProgram/subscribeService";
export const list = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        let result = await subscribeList();
        res.status(200).json({
            code: 200,
            message: "ok",
            data: result,
        });
    } catch (error) {
        res.status(403).json({ code: 403, message: "" });
    }
};
export const isSubscribeBind = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        let result = await isSubscribeService(req,res);
        res.status(200).json({
            code: 200,
            message: "ok",
            data: result,
        });
    } catch (error) {
        res.status(403).json({ code: 403, message: "" });
    }
};
