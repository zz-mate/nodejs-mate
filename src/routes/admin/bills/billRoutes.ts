import {Router} from 'express';
// @ts-ignore
import {list} from '../../../controllers/admin/bills/billController';

const router: Router = Router();


router.get('/admin/bills/bill/list', list);              // 获取列表

export default router;