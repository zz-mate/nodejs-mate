import type { Request, Response } from "express";
import accountCategoryModule from "../../modules/miniProgram/AccountCategoryModule";

export const accountCategoryCreateService = async (data: any) => {
  // @ts-ignore
  const { userId } = data;
  let result = await accountCategoryModule.create(userId);
  return result;
};
export const accountCategoryListService = async (
  req: Request,
  res: Response
) => {
  try {
    const { userId, page, pageSize, parentId } = req.body;
    console.log(req.body);
    return await accountCategoryModule.accountCategoryList(
      userId,
      page,
      pageSize,
      parentId
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

export const accountIndexCategoryListService = async (
  req: Request,
  res: Response
) => {
  const { parentId,isLetterGroup } = req.body;
  return await accountCategoryModule.accountIndexCategoryList(parentId,isLetterGroup);
};
