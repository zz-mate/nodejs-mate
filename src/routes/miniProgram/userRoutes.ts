import {Router} from 'express';
// @ts-ignore
import {info,qrcode,update} from '../../controllers/miniProgram/userController';

const router: Router = Router();


router.post('/miniProgram/user/info', info);              // 获取列表
router.post('/miniProgram/user/qrcode', qrcode);              // 获取列表
router.post('/miniProgram/user/update', update);              // 获取列表

export default router;