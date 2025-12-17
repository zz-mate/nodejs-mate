import { Router } from 'express';
// @ts-ignore
import { create } from '../../controllers/miniProgram/budgetController.ts';
const router = Router();
// @ts-ignore
router.post('/miniProgram/budget/create', create); // 创建预算
export default router;
