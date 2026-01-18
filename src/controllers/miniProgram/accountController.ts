import {
  accountCreateService,
  accountListService,accountUpdateService
} from "../../services/miniProgram/accountService";

/**
 * 添加分类
 * @param req
 * @param res
 */
export const create = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    let result = await accountCreateService(req.body);
    // @ts-ignore
    return res.status(200).json(result);
  } catch (err) {}
};
/**
 * 分类列表
 * @param req
 * @param res
 */
export const list = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    //   await categoryListService(req,res);
    let result = await accountListService(req, res);
    // @ts-ignore
    return res.status(200).json(result);
  } catch (err) {}
};
/**
 * 分类列表
 * @param req
 * @param res
 */
export const update = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        //   await categoryListService(req,res);
        let result = await accountUpdateService(req.body);
        // @ts-ignore
        return res.status(200).json(result);
    } catch (err) {}
};
