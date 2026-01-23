import {Router} from 'express';
// @ts-ignore
<<<<<<< HEAD
import {info,list} from '../../controllers/miniProgram/bookController.ts';
=======
import {info,list} from '../../controllers/miniProgram/bookController';
>>>>>>> 4d9c73e (🐛 修复打包)

const router: Router = Router();


// @ts-ignore
router.post('/miniProgram/book/info', info);              // 账本详情
// @ts-ignore
router.post('/miniProgram/book/list', list);              // 账本列表

export default router;