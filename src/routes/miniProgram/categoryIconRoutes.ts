import {Router} from 'express';
// @ts-ignore
import {list} from '../../controllers/miniProgram/categoryIconController';

const router: Router = Router();


router.post('/miniProgram/categoryIcon/list', list);              // 获取列表

export default router;