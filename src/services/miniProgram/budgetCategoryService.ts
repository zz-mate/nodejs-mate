import type {Request, Response} from "express";
import type {ApiResponse, BudgetCategoryDbSchema, BudgetDbSchema} from "../../types";
import budgetModule from "../../modules/miniProgram/BudgetModule";
import budgetCategoryModule from "../../modules/miniProgram/BudgetCategoryModule";

interface BudgetCategoryRequest extends Request, BudgetCategoryDbSchema {}

export const createBudgetCategoryService = async (req: BudgetCategoryRequest, res: Response<ApiResponse>) => {

    /**
     * 1-查询当前预算是否存在
     *  1-1 如果存在就更新预算
     *  2-新增预算
     */
   try {
       let {user_id, book_id, budget_id} = req.body;
       // 1.查询预算是否存在
       let bindBudget = await budgetModule.findById(user_id, book_id,budget_id)
       if (bindBudget) return res.status(403).json({
           code: 403,
           message: "预算不已存在",
           data: null
       });

       // 2.新增预算
       let result = await budgetCategoryModule.create(req.body)
       // @ts-ignore
       if (result >= 1) {
           return res.status(200).json({
               code: 200,
               message:result==1 ?"添加成功":"编辑成功",
               data: null
           });
       }


   }catch (err) {
       // @ts-ignore
       res.status(err.status).json({
           // @ts-ignore
           code: err.status,
           // @ts-ignore
           message: err.message
       })
   }

}

