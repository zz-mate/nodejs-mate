import {Router} from 'express';
// @ts-ignore
import {list,isSubscribeBind} from '../../controllers/miniProgram/subscribeController';

const router: Router = Router();


router.get('/miniProgram/subscribe/list', list);              // 获取列表
router.post('/miniProgram/subscribe/isSubscribeBind', isSubscribeBind);              // 获取列表

export default router;