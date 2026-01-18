import type {Request, Response} from "express";
// @ts-ignore
import cateModule from "../../../modules/admin/books/CateModule";

export const cateListService = async (req: Request, res: Response) => {
    // 断言 req.query 为键值都是字符串的对象（仅确定无数组时使用）
    const {
        page = '1',
        pageSize = '10',
    } = req.query as Record<string, string | undefined>;

    // 直接转换，类型完全匹配
    return await cateModule.findAll(
        parseInt(page, 10),
        parseInt(pageSize, 10)
    );
};
export const createBookCateService = async (req: Request, res: Response) => {
    // 断言 req.query 为键值都是字符串的对象（仅确定无数组时使用）

    // 直接转换，类型完全匹配
    return await cateModule.create(req.body);
};
