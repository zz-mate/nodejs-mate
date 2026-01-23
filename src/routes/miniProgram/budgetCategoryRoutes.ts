import {Router} from 'express';
// @ts-ignore
<<<<<<< HEAD
import {create} from '../../controllers/miniProgram/budgetCategoryController.ts';
=======
import {create} from '../../controllers/miniProgram/budgetCategoryController';
>>>>>>> 4d9c73e (🐛 修复打包)

const router: Router = Router();


// @ts-ignore
router.post('/miniProgram/budget/category/create', create);              // 创建预算

export default router;