import {Router} from 'express';

const router: Router = Router();


<<<<<<< HEAD
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
=======
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
>>>>>>> 4d9c73e (🐛 修复打包)
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