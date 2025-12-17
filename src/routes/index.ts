import {Router} from 'express';

const router: Router = Router();


import demoRoutes from './miniProgram/demoRoutes.ts'
import authRoutes from './miniProgram/authRoutes.ts'
import billRoutes from './miniProgram/billRoutes.ts'
import bookRoutes from './miniProgram/bookRoutes.ts'
import budgetRoutes from './miniProgram/budgetRoutes.ts'
import budgetCategory from './miniProgram/budgetCategoryRoutes.ts'
import categoryRoutes from './miniProgram/categoryRoutes.ts'
import accountCategoryRoutes from './miniProgram/accountCategoryRoutes.ts'
import accountRoutes from './miniProgram/accountRoutes.ts'
import userRoutes from './miniProgram/userRoutes.ts'
import calendarRoutes from './miniProgram/calendarRoutes.ts'
router.use(demoRoutes);
router.use(authRoutes);
router.use(billRoutes);
router.use(bookRoutes);
router.use(budgetRoutes);
router.use(budgetCategory);
router.use(categoryRoutes);
router.use(accountCategoryRoutes);
router.use(accountRoutes);
router.use(userRoutes);
router.use(calendarRoutes);



export default router