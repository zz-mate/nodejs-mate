import {Router} from 'express';

const router: Router = Router();
/*********************************************************************************************/
import uploadRoutes from './common/uploadRoutes'
import openAiRoutes from './common/openAiRoutes'

router.use(uploadRoutes);
router.use(openAiRoutes);

/*********************************************************************************************/
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
import compensationRoutes from './miniProgram/compensationRoutes'
import accountFlowRoutes from './miniProgram/accountFlowRoutes'
import appointmentExpenseRoutes from './miniProgram/appointmentExpenseRoutes'
import categoryIconRoutes from './miniProgram/categoryIconRoutes'
import planRoutes from './miniProgram/planRoutes'
import wxRoutes from './miniProgram/wxRoutes'

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
router.use(compensationRoutes);
router.use(accountFlowRoutes);
router.use(appointmentExpenseRoutes);
router.use(categoryIconRoutes);
router.use(planRoutes);
router.use(wxRoutes);

/*********************************************************************************************/
import authAdminRoutes from './admin/authRoutes'
import analyticsRoutes from './admin/analyticsRoutes'
import systemAdminUserRoutes from './admin/system/userRoutes'
import billsAdminBillRoutes from './admin/bills/billRoutes'
import billsAdminCateRoutes from './admin/bills/cateRoutes'
import booksAdminBookRoutes from './admin/books/bookRoutes'
import booksAdminCateRoutes from './admin/books/cateRoutes'
router.use(authAdminRoutes);
router.use(analyticsRoutes);
router.use(systemAdminUserRoutes);
router.use(billsAdminBillRoutes);
router.use(billsAdminCateRoutes);
router.use(booksAdminBookRoutes);
router.use(booksAdminCateRoutes);


/*********************************************************************************************/
export default router