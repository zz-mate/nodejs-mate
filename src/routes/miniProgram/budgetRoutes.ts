import {Router} from 'express';
// @ts-ignore
<<<<<<< HEAD
import {create, info} from '../../controllers/miniProgram/budgetController.ts';
=======
import {create, info} from '../../controllers/miniProgram/budgetController';
>>>>>>> 4d9c73e (🐛 修复打包)

const router: Router = Router();


// @ts-ignore
router.post('/miniProgram/budget/create', create);              // 创建预算
// @ts-ignore
router.post('/miniProgram/budget/info', info);              // 预算详情

export default router;