import type { Request, Response } from "express";
// @ts-ignore
import {calendarMonthService,calendarDateService,calendarMonthChartService} from "../../services/miniProgram/calendarService"
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
export  const  billByDate = async (req:Request,res:Response) => {
    try{
        // @ts-ignore
        let result =   await calendarDateService(req,res);
        res.status(200).json({
            code: 200,
            message:"ok",
            data: result
        });
    }catch (error){
        res.status(403).json({code:403,message:""})
    }
}

export  const  billByMonthChart = async (req:Request,res:Response) => {
    try{
        // @ts-ignore
        let result =   await calendarMonthChartService(req,res);
        res.status(200).json({
            code: 200,
            message:"ok",
            data: result
        });
    }catch (error){
        res.status(403).json({code:403,message:""})
    }
}