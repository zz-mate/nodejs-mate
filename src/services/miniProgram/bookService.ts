import type { Request, Response } from "express";
import bookModule from "../../modules/miniProgram/BookModule";

export const createBookService = async (data: any) => {
  // @ts-ignore
  const { userId, bookCategoryId, icon, name, description } = data;
  let result = await bookModule.createBook(
    userId,
    bookCategoryId,
    icon,
    name,
    description
  );
  return result;
};
export const bookInfoService = async (data: any) => {
  // @ts-ignore
  const { userId, bookId } = data;
  let result = await bookModule.bookInfo(userId, bookId);
  return result;
};
export const bookListService = async (req: Request, res: Response) => {
  try {
    const { userId, page, pageSize } = req.body;
    let result = await bookModule.bookList(userId, page, pageSize);
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

export const updateBookService = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    let { userId, bookId, ...updateData } = req.body;
    let result = await bookModule.updateBook(userId, bookId, updateData);
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
