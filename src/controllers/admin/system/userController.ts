import type { Request, Response } from "express";
// @ts-ignore
import {
userListService,
} from "../../../services/admin/system/userService";

/**
 * 用户列表
 */
export const list = async (req: Request, res: Response) => {
    try {
        let result = await userListService(req, res);
        return res.status(200).json(result);
    } catch (error) {
        console.error(error);
    }
};