import type { Request, Response } from "express";
// @ts-ignore
import { createPlanService,planListService,planByMonthService ,removePlanService,planInfoService,planUpdateService} from "../../services/miniProgram/planService";
export const create = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
    await createPlanService(req,res);

    } catch (error) {
        res.status(403).json({ code: 403, message: "" });
    }
};
export const list = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        await planListService(req,res);

    } catch (error) {
        res.status(403).json({ code: 403, message: "" });
    }
};

export const planByMonth = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        await planByMonthService(req,res);

    } catch (error) {
        res.status(403).json({ code: 403, message: "" });
    }
};
export const remove = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        await removePlanService(req,res);

    } catch (error) {
        res.status(403).json({ code: 403, message: "" });
    }
};

export const info = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        await planInfoService(req,res);

    } catch (error) {
        res.status(403).json({ code: 403, message: "" });
    }
};
export const update = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        await planUpdateService(req,res);

    } catch (error) {
        res.status(403).json({ code: 403, message: "" });
    }
};