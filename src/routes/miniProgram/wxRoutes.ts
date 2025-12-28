import {Router} from 'express';
// @ts-ignore
import {getCode2Session, saveUser} from '../../controllers/miniProgram/weixinController';

const router: Router = Router();


router.post('/miniProgram/sns/jscode2session', getCode2Session);              // 获取列表
router.post('/miniProgram/wx/saveUser', saveUser);              // 获取列表

export default router;