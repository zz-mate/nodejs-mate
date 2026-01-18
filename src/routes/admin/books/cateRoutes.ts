import {Router} from 'express';
// @ts-ignore
import {list,create} from '../../../controllers/admin/books/cateController';

const router: Router = Router();


router.get('/admin/books/cate/list', list);              // 获取列表
router.post('/admin/books/cate/create', create);              // 获取列表

export default router;