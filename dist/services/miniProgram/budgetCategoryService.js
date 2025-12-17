import budgetCategoryModule from "../../modules/miniProgram/BudgetCategoryModule.ts";
export const createBudgetCategoryService = async (req, res) => {
    console.log(req.body);
    /**
     * 1-查询当前预算是否存在
     *  1-1 如果存在就更新预算
     *  2-新增预算
     */
    let { user_id, book_id, category_id, budget_id } = req.body;
    // 1.查询预算是否存在
    let bindBudget = await budgetCategoryModule.findById(user_id, book_id, budget_id, category_id);
    if (bindBudget)
        return res.status(403).json({
            code: 403,
            message: "预算已存在",
            data: null
        });
    // 2.新增预算
    let result = await budgetCategoryModule.create(req.body);
    // @ts-ignore
    if (result == 1) {
        return res.status(200).json({
            code: 200,
            message: "添加成功",
            data: null
        });
    }
};
