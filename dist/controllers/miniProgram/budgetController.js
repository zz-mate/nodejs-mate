import { createBudgetService } from "../../services/miniProgram/budgetService.ts";
/**
 * 添加预算
 * @param req
 * @param res
 */
export const create = async (req, res) => {
    try {
        await createBudgetService(req, res);
    }
    catch (err) {
        return res.status(400).json({});
    }
};
