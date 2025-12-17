import {Router} from 'express';
// @ts-ignore
import {info} from '../../controllers/miniProgram/userController.ts';

const router: Router = Router();


router.post('/miniProgram/user/info', info);              // 获取列表

export default router;