import type { Request, Response } from "express";
// @ts-ignore
import userModule from "../../modules/miniProgram/UserModule";
export const compensationNewUserRegExp = async (
  req: Request,
  res: Response
) => {
  try {
    // @ts-ignore
    let { userId } = req.body;
    let result = await userModule.updateUserExp(
      userId,
      5,
      "新用户注册补偿",
      userId
    );
    res.json(result);
  } catch (error) {
    res.status(403).json({ code: 403, message: "" });
  }
};
