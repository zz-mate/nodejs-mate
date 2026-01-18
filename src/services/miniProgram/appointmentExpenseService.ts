// @ts-ignore
import appointmentExpenseModule from "../../modules/miniProgram/AppointmentExpenseModule";
import type {Request, Response} from "express";

export const createAppointmentExpenseService= async (req:Request,res:Response) => {
    return appointmentExpenseModule.create(req.body);
};
export const AppointmentExpenseListService= async (req:Request,res:Response) => {
    return appointmentExpenseModule.list(req.body);
};
export const removeAppointmentExpenseService= async (req:Request,res:Response) => {
    return appointmentExpenseModule.remove(req.body);
};
