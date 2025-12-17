import { Router } from 'express';
// @ts-ignore
import { create } from '../../controllers/miniProgram/billController.ts';
const router = Router();
// @ts-ignore
router.post('/miniProgram/bill/create', create); // 创建账单
export default router;
