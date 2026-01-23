import type {Request, Response} from "express";
// @ts-ignore
<<<<<<< HEAD
import {createBudgetCategoryService} from "../../services/miniProgram/budgetCategoryService.ts";
=======
import {createBudgetCategoryService} from "../../services/miniProgram/budgetCategoryService";
>>>>>>> 4d9c73e (🐛 修复打包)
// @ts-ignore
import type {BudgetCategoryDbSchema} from "../../types";
interface BudgetCategoryRequest extends Request, BudgetCategoryDbSchema {}

/**
 * 添加分类预算
 * @param req
 * @param res
 */
export  const create = async (req: BudgetCategoryRequest, res: Response) => {
    try{
        await createBudgetCategoryService(req,res);

    }catch(err){
        return res.status(400).json({})
    }
}

