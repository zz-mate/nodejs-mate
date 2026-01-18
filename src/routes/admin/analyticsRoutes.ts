import {Router} from 'express';
// @ts-ignore
import {getAnalyticsCards, totalCount} from '../../controllers/admin/analyticsController';

const router: Router = Router();


// @ts-ignore
router.get('/admin/analytics/getAnalyticsCards', getAnalyticsCards);              // 手机号登陆注册


export default router;