import {Router} from 'express';
// @ts-ignore
import {list} from '../../controllers/miniProgram/demoController.ts';

const router: Router = Router();


router.get('/miniProgram/demo/list', list);              // 获取列表

export default router;