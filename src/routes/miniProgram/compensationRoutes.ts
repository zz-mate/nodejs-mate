import {Router} from 'express';
// @ts-ignore
import {compensationNewUserRegExp} from '../../controllers/miniProgram/compensationController';

const router: Router = Router();


router.post('/compensationNewUserRegExp/exp5', compensationNewUserRegExp);              // 获取列表

export default router;