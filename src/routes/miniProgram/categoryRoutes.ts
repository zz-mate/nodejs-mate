import { Router } from "express";
// @ts-ignore
import {
  create,
  list,
  cateBindBill,deleteCate,
  getDeletelist,removelist,cateBillList
} from "../../controllers/miniProgram/categoryController";

const router: Router = Router();

// @ts-ignore
router.post("/miniProgram/category/create", create); // 创建；类别
// @ts-ignore
router.post("/miniProgram/category/list", list); // 类别列表
// @ts-ignore
router.post("/miniProgram/category/cateBindBill", cateBindBill); // 查询分类下是否有账单
// @ts-ignore
router.post("/miniProgram/category/deleteCate", deleteCate); // 删除类别
// @ts-ignore
router.post("/miniProgram/category/getDeletList", getDeletelist); // 被删除类别列表
// @ts-ignore
router.post("/miniProgram/category/removelist", removelist); // 还原类别

// @ts-ignore
router.post("/miniProgram/category/cateBillList", cateBillList); // 分类账单列表
export default router;
