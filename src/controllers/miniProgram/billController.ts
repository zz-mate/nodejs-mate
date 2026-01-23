import type { Request, Response } from "express";
// @ts-ignore
import type{ BillDbSchema} from "../../types"
interface BillRequest extends Request, BillDbSchema{}

// @ts-ignore
<<<<<<< HEAD
import {createBillService,billListService,billRemoveService,billInfoService} from "../../services/miniProgram/billService.ts";
=======
import {createBillService,billListService,billRemoveService,billInfoService} from "../../services/miniProgram/billService";
>>>>>>> 4d9c73e (🐛 修复打包)
/**
 * 创建账单
 */
export  const create = async (req:BillRequest,res:Response) => {
    try{
    await createBillService(req,res);

    }catch (error) {
        console.error(error);
    }
}
/**
 * 创建账单
 */
export  const list = async (req:Request,res:Response) => {
    try{
     let result =    await billListService(req,res);
        return res.status(200).json(result);
    }catch (error) {
        console.error(error);
    }
}
/**
 * 查看账单
 * @param req
 * @param res
 */
export const remove = async (req:Request,res:Response) => {
    try{
        let result =    await billRemoveService(req,res);
        return res.status(200).json(result);
    }catch (error) {
        console.error(error);
    }
}
/**
 * 账单详情
 * @param req
 * @param res
 */
export const info = async (req:Request,res:Response) => {
    try{
        let result =    await billInfoService(req,res);
        return res.status(200).json(result);
    }catch (error) {
        console.error(error);
    }
}