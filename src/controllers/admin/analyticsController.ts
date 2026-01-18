import type { Request, Response } from "express";
// @ts-ignore
import { analyticsService } from "../../services/admin/analyticsService";
export const getAnalyticsCards = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        let result = await analyticsService();
        res.status(200).json(result
        );
    } catch (error) {
        res.status(403).json({ code: 403, message: "" });
    }
};
