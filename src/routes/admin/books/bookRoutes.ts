import {Router} from 'express';
// @ts-ignore
import {list} from '../../../controllers/admin/books/bookController';

const router: Router = Router();


router.get('/admin/books/book/list', list);              // 获取列表

export default router;