import {Router} from 'express';
// @ts-ignore
import {create, list} from '../../controllers/miniProgram/categoryController';

const router: Router = Router();


// @ts-ignore
router.post('/miniProgram/category/create', create);              // 创建分类
// @ts-ignore
router.post('/miniProgram/category/list', list);              // 分类列表

export default router;