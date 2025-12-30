import type { Request, Response } from "express";
import type { ApiResponse, BudgetDbSchema } from "../../types";
import budgetModule from "../../modules/miniProgram/BudgetModule";

interface BudgetRequest extends Request, BudgetDbSchema {}

export const createBudgetService = async (
  req: BudgetRequest,
  res: Response<ApiResponse>
) => {
  try {
    let result = await budgetModule.create(req.body);

    return res.status(200).json({
      code: 200,
      message: "添加成功",
      // @ts-ignore
      data: result,
    });
  } catch (err) {
    // @ts-ignore
    res.status(err.status).json({
      // @ts-ignore
      code: err.status,
      // @ts-ignore
      message: err.message,
    });
  }
};

export const budgetInfoService = async (
  req: Request,
  res: Response<BudgetDbSchema>
) => {
  try {
    // @ts-ignore
    const { userId, bookId } = req.body;
    let result = await budgetModule.info(userId, bookId);

    return res.status(200).json(result);
  } catch (err) {
    // @ts-ignore
    res.status(err.status).json({
      // @ts-ignore
      code: err.status,
      // @ts-ignore
      message: err.message,
    });
  }
};
