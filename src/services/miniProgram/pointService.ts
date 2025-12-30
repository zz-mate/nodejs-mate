// @ts-ignore
import pointModule from "../../modules/miniProgram/PointModule";
import userModule from "../../modules/miniProgram/UserModule";
import HttpError from "../../utils/HttpError";
import type { Request, Response } from "express";

export const createPointService = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    let { userId } = req.body;
    let existingUser = await userModule.findById(userId);
    if (!existingUser) {
      throw new HttpError(`用户不存在`, 403);
    }
    // @ts-ignore
    let result = await pointModule.addPoints(userId);
    return result;
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
