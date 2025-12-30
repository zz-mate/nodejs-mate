import type { Request, Response } from "express";
// @ts-ignore
import { demoList } from "../../services/miniProgram/demoService";
export const list = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    let result = await demoList();
    res.status(200).json({
      code: 200,
      message: "ok",
      data: result,
    });
  } catch (error) {
    res.status(403).json({ code: 403, message: "" });
  }
};
