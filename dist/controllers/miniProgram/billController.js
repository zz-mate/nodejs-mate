// @ts-ignore
import { createBillService } from "../../services/miniProgram/billService.ts";
/**
 * 创建账单
 */
export const create = async (req, res) => {
    try {
        await createBillService(req, res);
    }
    catch (error) {
        console.error(error);
    }
};
