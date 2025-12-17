import {Router} from 'express';
// @ts-ignore
import {billByMonth} from '../../controllers/miniProgram/calendarController.ts';

const router: Router = Router();


router.post('/miniProgram/calendar/billByMonth', billByMonth);              // 获取选中月账单支出收入列表

export default router;