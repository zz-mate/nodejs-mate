import billModule from "../../modules/miniProgram/BillModule.ts";
import userModule from "../../modules/miniProgram/UserModule.ts";
import bookModule from "../../modules/miniProgram/BookModule.ts";
import categoryModule from "../../modules/miniProgram/CategoryModule.ts";
import { validateRequiredFields } from "../../utils/checkResult.ts";
/**
 * 创建账单
 * @param req
 * @param res
 */
export const createBillService = async function (req, res) {
    /**
     * 1-校验 参数 user_id book_id  amount 不能为空
     * 2- 查询用户表是否存在用户
     *      2-1 如果存在就去添加账单
     *      2-2 不存在 报错异常
     *
     */
    try { // 1.校验 参数
        validateRequiredFields(req.body, ['user_id', 'book_id', 'amount', 'category_id'], {
            user_id: '用户ID',
            book_id: '账本ID',
            amount: '金额',
            category_id: '分类ID'
        });
        const { user_id, book_id, category_id } = req.body;
        // 2. 校验用户是否存在
        let existingUser = await userModule.findById(user_id);
        //  2-1. 用户不存在抛出异常
        if (!existingUser)
            return res.status(403).json({
                code: 403,
                message: "用户不存在",
                data: null
            });
        // 3.校验账本是否存在 <在创建账单的时候 用户可以手动选择账本 这个时候要判断一下用户下的账本是否存在>
        let existingBook = await bookModule.findById(book_id, user_id);
        //  3-1. 用户不存在抛出异常
        if (!existingBook)
            return res.status(403).json({
                code: 403,
                message: "账本不存在",
                data: null
            });
        // 4.校验账本是否存在 <在创建账单的时候 用户可以手动选择账本 这个时候要判断一下用户下的账本是否存在>
        let existingCategory = await categoryModule.findById(category_id);
        //  4-1. 用户不存在抛出异常
        if (!existingCategory)
            return res.status(403).json({
                code: 403,
                message: "分类不存在",
                data: null
            });
        // 5.创建账单
        let result = await billModule.create(req.body);
        // @ts-ignore
        if (result == 1) {
            return res.status(200).json({
                code: 200,
                message: "添加成功",
                data: null
            });
        }
    }
    catch (error) {
        // @ts-ignore
        return res.status(400).json({
            code: 403,
            // @ts-ignore
            message: error.message, // 把校验错误信息返回给前端
            data: null
        });
    }
};
