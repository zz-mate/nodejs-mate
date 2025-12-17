import {Router} from 'express';
// @ts-ignore
import {create,list,remove,info} from '../../controllers/miniProgram/billController';

const router: Router = Router();


// @ts-ignore
router.post('/miniProgram/bill/create', create);              // 创建账单
// @ts-ignore
router.post('/miniProgram/bill/list', list);              // 账单列表
// @ts-ignore
router.post('/miniProgram/bill/remove', remove);              // 删除账单
// @ts-ignore
router.post('/miniProgram/bill/info', info);              // 删除账单

export default router;