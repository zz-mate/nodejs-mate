import type {Request, Response} from "express";
// @ts-ignore
import bookModule from "../../../modules/admin/books/BookModule";

export const bookListService = async (req: Request, res: Response) => {
    // 断言 req.query 为键值都是字符串的对象（仅确定无数组时使用）
    const {
        page = '1',
        pageSize = '10',
        isActive,
        name,
        bookCategoryId,

        userId
    } = req.query as Record<string, string | undefined>;

    // 直接转换，类型完全匹配
    return await bookModule.findAll(
        parseInt(page, 10),
        parseInt(pageSize, 10),
        isActive? parseInt(isActive, 10) : undefined,
        name,
        bookCategoryId ? parseInt(bookCategoryId, 10) : undefined,
        userId ? parseInt(userId, 10) : undefined
    );
};