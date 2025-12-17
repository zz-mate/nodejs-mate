import type { Request, Response } from "express";
// @ts-ignore
import calendarModule from "../../modules/miniProgram/CalendarModule.ts"

export const calendarMonthService = (req: Request, res: Response) => {
    const {userId, date,page, pageSize} = req.body;
    return calendarModule.calendarMonth(userId,date,page, pageSize)
}