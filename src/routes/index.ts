import {Router} from 'express';

const router: Router = Router();


import demoRoutes from './miniProgram/demoRoutes'
import authRoutes from './miniProgram/authRoutes'
import billRoutes from './miniProgram/billRoutes'
import bookRoutes from './miniProgram/bookRoutes'
import budgetRoutes from './miniProgram/budgetRoutes'
import budgetCategory from './miniProgram/budgetCategoryRoutes'
import categoryRoutes from './miniProgram/categoryRoutes'
import accountCategoryRoutes from './miniProgram/accountCategoryRoutes'
import accountRoutes from './miniProgram/accountRoutes'
import userRoutes from './miniProgram/userRoutes'
import calendarRoutes from './miniProgram/calendarRoutes'
import bookCategoryRoutes from './miniProgram/bookCategoryRoutes'
import pointRoutes from './miniProgram/pointRoutes'
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
router.use(bookCategoryRoutes);
router.use(pointRoutes);



export default router