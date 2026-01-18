import {Router} from 'express';
// @ts-ignore
import {list} from '../../controllers/miniProgram/accountFlowController';

const router: Router = Router();


router.post('/miniProgram/accountFlow/list', list);

export default router;