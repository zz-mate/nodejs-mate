import type { Request, Response } from "express";
import categoryModule from "../../modules/miniProgram/CategoryModule";

export const categoryCreateService = async (data: any) => {
  // @ts-ignore
  const { userId } = data;
  let result = await categoryModule.create(userId);
  return result;
};
export const categoryListService = async (req: Request, res: Response) => {
  try {
    const { userId, page, pageSize, type, bookCategoryId } = req.body;

    return await categoryModule.categoryList(
      userId,
      page,
      pageSize,
      type,
      bookCategoryId
    );
  } catch (err) {
    // @ts-ignore
    res.status(err.status).json({
      // @ts-ignore
      code: err.status,
      // @ts-ignore
      message: err.message,
    });
  }
};

export const cateBindBillCategoryService = async (req: Request, res: Response) => {
  // @ts-ignore
  const { categoryId,currentUserId } = req.body;
  let result = await categoryModule.cateBindBill(categoryId,currentUserId);
  return result;
};

export const deleteCateCategoryService = async (req: Request, res: Response) => {
  // @ts-ignore
  const { categoryId ,currentUserId,deleteBill} = req.body;
  let result = await categoryModule.deleteCate(categoryId,currentUserId,deleteBill);
  return result;
};

export const deleteListCategoryService = async (req: Request, res: Response) => {
  try {
    const { userId, page, pageSize, type, bookCategoryId } = req.body;

    return await categoryModule.categoryaDeleteList(
      userId,
      page,
      pageSize,
      type,
      bookCategoryId
    );
  } catch (err) {
    // @ts-ignore
    res.status(err.status).json({
      // @ts-ignore
      code: err.status,
      // @ts-ignore
      message: err.message,
    });
  }
};



export const removeListCategoryService = async (req: Request, res: Response) => {
  // @ts-ignore
  const { categoryDeleteId ,currentUserId,categoryId} = req.body;
  let result = await categoryModule.removeCategoryDelete(categoryDeleteId,currentUserId,categoryId);
  return result;
};


export const categoryBillListService = async (req: Request, res: Response) => {
    try {
        const { userId,page, pageSize,start_time, end_time,bookId,type,categoryId} = req.body;
        return await categoryModule.categoryBillList(
            userId,page, pageSize,start_time, end_time,bookId,type,categoryId
        );
    } catch (err) {
        // @ts-ignore
        res.status(err.status).json({
            // @ts-ignore
            code: err.status,
            // @ts-ignore
            message: err.message,
        });
    }
};

export const categorySortService = async (req: Request, res: Response) => {
    try {
        const { userId,bookId,categoryId,sortOrder} = req.body;
        return await categoryModule.categorySort(
            userId,bookId,categoryId,sortOrder
        );
    } catch (err) {
        // @ts-ignore
        res.status(err.status).json({
            // @ts-ignore
            code: err.status,
            // @ts-ignore
            message: err.message,
        });
    }
};
