import type { Request, Response } from "express";
import {
  createBudgetService,
  budgetInfoService,
} from "../../services/miniProgram/budgetService";
import type { BudgetDbSchema } from "../../types";
interface BudgetRequest extends Request, BudgetDbSchema {}

/**
 * 添加预算
 * @param req
 * @param res
 */
export const create = async (req: BudgetRequest, res: Response) => {
  await createBudgetService(req, res);
};
/**
 * 预算详情
 * @param req
 * @param res
 */
export const info = async (req: Request, res: Response) => {
  await budgetInfoService(req, res);
};
