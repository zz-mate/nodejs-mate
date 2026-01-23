import {Router} from 'express';
// @ts-ignore
<<<<<<< HEAD
import {create,list} from '../../controllers/miniProgram/accountCategoryController.ts';
=======
import {create,list} from '../../controllers/miniProgram/accountCategoryController';
>>>>>>> 4d9c73e (🐛 修复打包)

const router: Router = Router();


// @ts-ignore
router.post('/miniProgram/account/category/create', create);              // 手机号登陆注册
// @ts-ignore
router.post('/miniProgram/account/category/list', list);
export default router;