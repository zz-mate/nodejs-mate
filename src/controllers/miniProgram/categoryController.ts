import {categoryCreateService,categoryListService} from "../../services/miniProgram/categoryService.ts";
import {billInfoService} from "../../services/miniProgram/billService.ts";

/**
 * 添加分类
 * @param req
 * @param res
 */
export const create = async (req: Request, res: Response) => {

    try {
        // @ts-ignore
        let result = await categoryCreateService(req.body);
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
        //   await categoryListService(req,res);
        let result =    await categoryListService(req,res);
    // @ts-ignore
        return res.status(200).json(result);
    } catch (err) {

    }
}
