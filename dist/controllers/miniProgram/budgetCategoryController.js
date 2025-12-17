// @ts-ignore
import { createBudgetCategoryService } from "../../services/miniProgram/budgetCategoryService.ts";
/**
 * 添加分类预算
 * @param req
 * @param res
 */
export const create = async (req, res) => {
    try {
        await createBudgetCategoryService(req, res);
    }
    catch (err) {
        return res.status(400).json({});
    }
};
