import {Router} from 'express';
// @ts-ignore
<<<<<<< HEAD
import {create,list} from '../../controllers/miniProgram/accountController.ts';
=======
import {create,list} from '../../controllers/miniProgram/accountController';
>>>>>>> 4d9c73e (🐛 修复打包)

const router: Router = Router();


// @ts-ignore
router.post('/miniProgram/account/create', create);              // 手机号登陆注册
// @ts-ignore
router.post('/miniProgram/account/list', list);
export default router;