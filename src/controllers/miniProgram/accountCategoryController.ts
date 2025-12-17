import {accountCategoryCreateService,accountCategoryListService} from "../../services/miniProgram/accountCategoryService";

/**
 * 添加分类
 * @param req
 * @param res
 */
export const create = async (req: Request, res: Response) => {

    try {
        // @ts-ignore
        let result = await accountCategoryCreateService(req.body);
        // @ts-ignore
        return res.status(200).json(result);
    } catch (err) {

    }
}
/**
 * 分类列表
 * @param req
 * @param res
 */
export const list = async (req: Request, res: Response) => {

    try {
        // @ts-ignore
        let result =    await accountCategoryListService(req,res);
        // @ts-ignore
        return res.status(200).json(result);
    } catch (err) {

    }
}
