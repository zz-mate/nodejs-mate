import {Router} from 'express';
// @ts-ignore
import {billByMonth,billByDate,billByMonthChart} from '../../controllers/miniProgram/calendarController';

const router: Router = Router();


router.post('/miniProgram/calendar/billByMonth', billByMonth);              // 获取选中月账单支出收入列表
router.post('/miniProgram/calendar/billByDate', billByDate);              // 获取选中月账单支出收入列表
router.post('/miniProgram/calendar/billByMonthChart', billByMonthChart);
export default router;