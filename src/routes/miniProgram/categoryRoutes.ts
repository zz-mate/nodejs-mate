import {Router} from 'express';
// @ts-ignore
<<<<<<< HEAD
import {create, list} from '../../controllers/miniProgram/categoryController.ts';
=======
import {create, list} from '../../controllers/miniProgram/categoryController';
>>>>>>> 4d9c73e (🐛 修复打包)

const router: Router = Router();


// @ts-ignore
router.post('/miniProgram/category/create', create);              // 创建分类
// @ts-ignore
router.post('/miniProgram/category/list', list);              // 分类列表

export default router;