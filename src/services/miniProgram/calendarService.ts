import type { Request, Response } from "express";
// @ts-ignore
import calendarModule from "../../modules/miniProgram/CalendarModule"

export const calendarMonthService = (req: Request, res: Response) => {
    const {userId,bookId, start_time} = req.body;
    return calendarModule.calendarMonth(userId,bookId,start_time)
}
export const calendarDateService = (req: Request, res: Response) => {
    const {userId,bookId, start_time,page,pageSize,categoryId,type} = req.body;
    return calendarModule.calendarDate(userId,bookId,start_time,page,pageSize,categoryId,type)
}


export const calendarMonthChartService = (req: Request, res: Response) => {
    const {userId,bookId, start_time,type} = req.body;
    return calendarModule.calendarMonthChart(userId,bookId,start_time,type)
}