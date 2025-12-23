import {Router} from 'express';
// @ts-ignore
import {create} from '../../controllers/miniProgram/pointController';

const router: Router = Router();


router.post('/miniProgram/point/create', create);              // 获取列表

export default router;