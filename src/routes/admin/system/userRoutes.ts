import {Router} from 'express';
// @ts-ignore
import {list} from '../../../controllers/admin/system/userController';

const router: Router = Router();


router.get('/admin/system/user/list', list);              // 获取列表

export default router;