import {Router} from 'express';
// @ts-ignore
<<<<<<< HEAD
import {info} from '../../controllers/miniProgram/userController.ts';
=======
import {info} from '../../controllers/miniProgram/userController';
>>>>>>> 4d9c73e (🐛 修复打包)

const router: Router = Router();


router.post('/miniProgram/user/info', info);              // 获取列表

export default router;