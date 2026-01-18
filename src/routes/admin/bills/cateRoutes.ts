import {Router} from 'express';
// @ts-ignore
import {create, list} from '../../../controllers/admin/bills/cateController';

const router: Router = Router();


router.get('/admin/bills/cate/list', list);              // 获取列表 // 获取列表
router.post('/admin/bills/cate/create', create);

export default router;