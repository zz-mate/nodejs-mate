import {Router} from 'express';
// @ts-ignore
import {create,list,remove} from '../../controllers/miniProgram/appointmentExpenseController';

const router: Router = Router();


router.post('/miniProgram/appointment/create', create);              // 获取列表
router.post('/miniProgram/appointment/list', list);              // 获取列表
router.post('/miniProgram/appointment/remove', remove);              // 获取列表

export default router;