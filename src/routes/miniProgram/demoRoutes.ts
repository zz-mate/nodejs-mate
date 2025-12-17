import {Router} from 'express';
// @ts-ignore
import {list} from '../../controllers/miniProgram/demoController';

const router: Router = Router();


router.get('/demo/list', list);              // 获取列表

export default router;