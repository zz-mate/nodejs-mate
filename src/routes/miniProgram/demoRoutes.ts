import {Router} from 'express';
// @ts-ignore
<<<<<<< HEAD
import {list} from '../../controllers/miniProgram/demoController.ts';
=======
import {list} from '../../controllers/miniProgram/demoController';
>>>>>>> 4d9c73e (🐛 修复打包)

const router: Router = Router();


<<<<<<< HEAD
router.get('/miniProgram/demo/list', list);              // 获取列表
=======
router.get('/demo/list', list);              // 获取列表
>>>>>>> 4d9c73e (🐛 修复打包)

export default router;