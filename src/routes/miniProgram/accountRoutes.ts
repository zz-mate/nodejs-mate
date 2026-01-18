import {Router} from 'express';
// @ts-ignore
import {create,list,update} from '../../controllers/miniProgram/accountController';

const router: Router = Router();


// @ts-ignore
router.post('/miniProgram/account/create', create);              // 手机号登陆注册
// @ts-ignore
router.post('/miniProgram/account/list', list);
// @ts-ignore
router.post('/miniProgram/account/update', update);
export default router;