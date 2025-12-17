import {Router} from 'express';
// @ts-ignore
import {create,list} from '../../controllers/miniProgram/accountCategoryController';

const router: Router = Router();


// @ts-ignore
router.post('/miniProgram/account/category/create', create);              // 手机号登陆注册
// @ts-ignore
router.post('/miniProgram/account/category/list', list);
export default router;