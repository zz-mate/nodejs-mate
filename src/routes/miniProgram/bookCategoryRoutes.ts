import {Router} from 'express';
// @ts-ignore
import {list} from '../../controllers/miniProgram/bookCategoryController';

const router: Router = Router();


// @ts-ignore
// router.post('/miniProgram/book/info', info);              // 账本详情
// @ts-ignore
router.post('/miniProgram/book/category/list', list);              // 账本列表

export default router;