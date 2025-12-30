import {
  createBookService,
  bookInfoService,
  bookListService,
  updateBookService,
} from "../../services/miniProgram/bookService";

export const create = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    let result = await createBookService(req.body);
    // @ts-ignore
    return res.status(200).json(result);
  } catch (err) {}
};

export const info = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    let result = await bookInfoService(req.body);
    // @ts-ignore
    return res.status(200).json(result);
  } catch (err) {}
};

export const list = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    let result = await bookListService(req, res);
    // @ts-ignore
    return res.status(200).json(result);
  } catch (err) {}
};

export const update = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    let result = await updateBookService(req, res);
    // @ts-ignore
    return res.status(200).json(result);
  } catch (err) {}
};
