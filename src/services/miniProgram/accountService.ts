import type { Request, Response } from "express";
import accountModule from "../../modules/miniProgram/AccountModule";

export const accountCreateService = async (data: any) => {
  let result = await accountModule.create(data );
  return result;
};
export const accountListService = async (req: Request, res: Response) => {
  try {
    const { userId, page, pageSize } = req.body;

    return await accountModule.accountList(userId, page, pageSize);
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

export const accountUpdateService = async (data: any) => {
    let result = await accountModule.update(data );
    return result;
};
