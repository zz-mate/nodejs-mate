import type { Request, Response } from "express";
const schedule = require('node-schedule');
// @ts-ignore
import { createAppointmentExpenseService,AppointmentExpenseListService,removeAppointmentExpenseService } from "../../services/miniProgram/appointmentExpenseService";
export const create = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        let result = await createAppointmentExpenseService(req,res);
        res.status(200).json({
            code: result.code,
            message: result.message,
            data: result,
        });
    } catch (error:any) {
        // @ts-ignore
        res.status(error.status)
            .json({ code: error.status, message: (error as Error).message });
    }
};
export const list = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        let result = await AppointmentExpenseListService(req,res);
        res.status(200).json(result
        );
    } catch (error) {
        // @ts-ignore
        res.status(403).json({ code: 403, message: error.message});
    }
};

export const remove = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        let result = await removeAppointmentExpenseService(req,res);
        res.status(200).json(result
        );
    } catch (error) {
        // @ts-ignore
        res.status(403).json({ code: 403, message: error.message});
    }
};



