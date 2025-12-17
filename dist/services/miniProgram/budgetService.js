import budgetModule from "../../modules/miniProgram/BudgetModule.ts";
export const createBudgetService = async (req, res) => {
    console.log(req.body);
    /**
     * 1-查询当前预算是否存在
     * 2-新增预算
     */
    let { user_id, book_id, cycle_type, cycle_start, cycle_end } = req.body;
    // 1.查询预算是否存在
    let bindBudget = await budgetModule.findById(user_id, book_id, cycle_type, cycle_start, cycle_end);
    if (bindBudget)
        return res.status(403).json({
            code: 403,
            message: "预算已存在",
            data: null
        });
    // 2.新增预算
    let result = await budgetModule.create(req.body);
    // @ts-ignore
    if (result == 1) {
        return res.status(200).json({
            code: 200,
            message: "添加成功",
            data: null
        });
    }
};
