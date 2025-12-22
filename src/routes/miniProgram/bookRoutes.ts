import {Router} from 'express';
// @ts-ignore
import {create, info,list,update} from '../../controllers/miniProgram/bookController';

const router: Router = Router();

// @ts-ignore
router.post('/miniProgram/book/create', create);              // 账本详情
// @ts-ignore
router.post('/miniProgram/book/info', info);              // 账本详情
// @ts-ignore
router.post('/miniProgram/book/list', list);              // 账本列表
// @ts-ignore
router.post('/miniProgram/book/update', update);              // 账本列表

export default router;