import {Router} from 'express';
// @ts-ignore
import {loginByPhone,userInfo} from '../../controllers/miniProgram/authController.ts';

const router: Router = Router();


// @ts-ignore
router.post('/miniProgram/auth/loginByPhone', loginByPhone);              // 手机号登陆注册
// @ts-ignore
router.get('/miniProgram/auth/userInfo', userInfo);
export default router;