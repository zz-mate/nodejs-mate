import {Router} from 'express';
// @ts-ignore
<<<<<<< HEAD
import {loginByPhone,userInfo} from '../../controllers/miniProgram/authController.ts';
=======
import {loginByPhone,userInfo} from '../../controllers/miniProgram/authController';
>>>>>>> 4d9c73e (🐛 修复打包)

const router: Router = Router();


// @ts-ignore
router.post('/miniProgram/auth/loginByPhone', loginByPhone);              // 手机号登陆注册
// @ts-ignore
router.get('/miniProgram/auth/userInfo', userInfo);
export default router;