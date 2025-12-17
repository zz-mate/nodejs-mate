import {Router} from 'express';
// @ts-ignore
import {create,list} from '../../controllers/miniProgram/accountController.ts';

const router: Router = Router();


// @ts-ignore
router.post('/miniProgram/account/create', create);              // 手机号登陆注册
// @ts-ignore
router.post('/miniProgram/account/list', list);
export default router;