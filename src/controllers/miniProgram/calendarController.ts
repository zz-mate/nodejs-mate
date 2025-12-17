import type { Request, Response } from "express";
// @ts-ignore
import {calendarMonthService} from "../../services/miniProgram/calendarService.ts"
export  const  billByMonth = async (req:Request,res:Response) => {
    try{
        // @ts-ignore
        let result =   await calendarMonthService(req,res);
        res.status(200).json({
            code: 200,
            message:"ok",
            data: result
        });
    }catch (error){
        res.status(403).json({code:403,message:""})
    }
}