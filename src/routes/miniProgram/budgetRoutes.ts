import {Router} from 'express';
// @ts-ignore
import {create, info,remove} from '../../controllers/miniProgram/budgetController';

const router: Router = Router();


// @ts-ignore
router.post('/miniProgram/budget/create', create);              // 创建预算
// @ts-ignore
router.post('/miniProgram/budget/info', info);              // 预算详情
// @ts-ignore
router.post('/miniProgram/budget/remove', remove);              // 预算详情

export default router;