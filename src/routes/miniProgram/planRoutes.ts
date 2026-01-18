import {Router} from 'express';
// @ts-ignore
import {create,list,planByMonth,remove,info,update} from '../../controllers/miniProgram/planController';

const router: Router = Router();


router.post('/miniProgram/plan/create', create);              // 获取列表
router.post('/miniProgram/plan/list', list);              // 获取列表
router.post('/miniProgram/plan/planByMonth', planByMonth);              // 获取列表
router.post('/miniProgram/plan/remove', remove);              // 获取列表
router.post('/miniProgram/plan/info', info);              // 获取列表
router.post('/miniProgram/plan/update', update);              // 获取列表

export default router;