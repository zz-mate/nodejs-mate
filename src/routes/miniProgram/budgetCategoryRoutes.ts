import {Router} from 'express';
// @ts-ignore
import {create} from '../../controllers/miniProgram/budgetCategoryController';

const router: Router = Router();


// @ts-ignore
router.post('/miniProgram/budget/category/create', create);              // 创建预算

export default router;