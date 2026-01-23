import {Router} from 'express';
// @ts-ignore
<<<<<<< HEAD
import {billByMonth} from '../../controllers/miniProgram/calendarController.ts';
=======
import {billByMonth} from '../../controllers/miniProgram/calendarController';
>>>>>>> 4d9c73e (🐛 修复打包)

const router: Router = Router();


router.post('/miniProgram/calendar/billByMonth', billByMonth);              // 获取选中月账单支出收入列表

export default router;