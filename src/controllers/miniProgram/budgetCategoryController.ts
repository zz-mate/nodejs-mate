import type { Request, Response } from "express";
// @ts-ignore
import {
  createBudgetCategoryService,
  deleteBudgetCategoryService,
} from "../../services/miniProgram/budgetCategoryService";
// @ts-ignore
import type { BudgetCategoryDbSchema } from "../../types";
interface BudgetCategoryRequest extends Request, BudgetCategoryDbSchema {}

/**
 * 添加分类预算
 * @param req
 * @param res
 */
export const create = async (req: BudgetCategoryRequest, res: Response) => {
  try {
    await createBudgetCategoryService(req, res);
  } catch (err) {
    return res.status(400).json({});
  }
};

export const delet = async (req: Request, res: Response) => {
  try {
    await deleteBudgetCategoryService(req, res);
  } catch (err) {
    return res.status(400).json({});
  }
};
