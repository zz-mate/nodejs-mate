import type { Request, Response } from "express";
// @ts-ignore
<<<<<<< HEAD
import calendarModule from "../../modules/miniProgram/CalendarModule.ts"
=======
import calendarModule from "../../modules/miniProgram/CalendarModule"
>>>>>>> 4d9c73e (🐛 修复打包)

export const calendarMonthService = (req: Request, res: Response) => {
    const {userId, date,page, pageSize} = req.body;
    return calendarModule.calendarMonth(userId,date,page, pageSize)
}