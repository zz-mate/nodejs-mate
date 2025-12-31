import {
  categoryCreateService,deleteCateCategoryService,
  categoryListService,cateBindBillCategoryService,deleteListCategoryService,removeListCategoryService,categoryBillListService
} from "../../services/miniProgram/categoryService";

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
    let result = await categoryListService(req, res);
    // @ts-ignore
    return res.status(200).json(result);
  } catch (err) {}
};



/**
 * 分类列表
 * @param req
 * @param res
 */
export const cateBindBill = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    //   await categoryListService(req,res);
    let result = await cateBindBillCategoryService(req, res);
    // @ts-ignore
    return res.status(200).json(result);
  } catch (err) {}
};

export const deleteCate = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    //   await categoryListService(req,res);
    let result = await deleteCateCategoryService(req, res);
    // @ts-ignore
    return res.status(200).json(result);
  } catch (err) {}
};

export const getDeletelist = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    //   await categoryListService(req,res);
    let result = await deleteListCategoryService(req, res);
    // @ts-ignore
    return res.status(200).json(result);
  } catch (err) {}
};


export const removelist = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    //   await categoryListService(req,res);
    let result = await removeListCategoryService(req, res);
    // @ts-ignore
    return res.status(200).json(result);
  } catch (err) {}
};


export const cateBillList = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        //   await categoryListService(req,res);
        let result = await categoryBillListService(req, res);
        // @ts-ignore
        return res.status(200).json(result);
    } catch (err) {}
};
