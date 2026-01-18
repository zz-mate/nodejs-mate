import {Router} from 'express';
// @ts-ignore
import {getCodes, loginByAccount, userInfo} from '../../controllers/admin/authController';

const router: Router = Router();


// @ts-ignore
router.post('/admin/auth/loginByAccount', loginByAccount);              // 手机号登陆注册
// @ts-ignore
router.get('/admin/user/info', userInfo);
// @ts-ignore
router.get('/admin/auth/codes', getCodes);

export default router;