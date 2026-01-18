

// @ts-ignore
import accountFlowModule from "../../modules/miniProgram/accountFlowModule";
import billModule from "@/modules/miniProgram/BillModule";
import type {Request, Response} from "express";

export const accountFlowListService = async (req: Request, res: Response) =>  {

    try {
        const {
            userId,    accountId,
            page,
            pageSize,
            start_time,
            end_time,
        } = req.body;
        return await accountFlowModule.findByAccountId(
            userId,
            accountId,
            page,
            pageSize,
            start_time,
            end_time,

        );
    } catch (err) {
        // @ts-ignore
        res.status(err.status).json({
            // @ts-ignore
            code: err.status,
            // @ts-ignore
            message: err.message,
        });
    }
};
