import type {Request, Response} from "express";
// @ts-ignore
import billModule from "../../../modules/admin/bills/BillModule";

export const billListService = async (req: Request, res: Response) => {
    // 断言 req.query 为键值都是字符串的对象（仅确定无数组时使用）
    const {
        page = '1',
        pageSize = '10',
        type,
        startTime,
        endTime,
        isDeleted = '0',
        accountId,
        categoryId,
        bookId,
        role,
        userId
    } = req.query as Record<string, string | undefined>;

    // 直接转换，类型完全匹配
    return await billModule.findAll(
        parseInt(page, 10),
        parseInt(pageSize, 10),
        type,
        startTime,
        endTime,
        parseInt(isDeleted, 10),
        accountId ? parseInt(accountId, 10) : undefined,
        categoryId ? parseInt(categoryId, 10) : undefined,
        bookId ? parseInt(bookId, 10) : undefined,
        role,
        userId ? parseInt(userId, 10) : undefined
    );
};