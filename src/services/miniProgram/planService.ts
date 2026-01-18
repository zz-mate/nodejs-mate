// @ts-ignore
import planModule from "../../modules/miniProgram/PlanModule";

import { Request, Response } from "express"; // 确保导入 express 类型

/**
 * 创建计划的接口服务函数
 * @param req Express 请求对象
 * @param res Express 响应对象
 */
export const createPlanService = async (req: Request, res: Response) => {
    try {
        // 1. 参数校验（基础非空校验，可根据业务扩展）
        const { userId, name, content, planTime, planType } = req.body;
        if (!userId || !name || !content || !planTime || !planType) {
            return res.status(400).json({
                code: 400,
                message: "参数缺失：userId/name/content/planTime/planType 为必填项",
                data: null
            });
        }

        // 2. 调用计划创建方法（await 等待异步执行完成）
        const result = await planModule.create(req.body);

        // 3. 返回成功响应
        return res.status(200).json({
            code: 200,
            message: "计划创建成功",
            data: result // 包含 planId 等信息
        });
    } catch (error) {
        // 4. 统一错误处理
        console.error("创建计划接口异常：", error);
        return res.status(500).json({
            code: 500,
            message: `计划创建失败：${(error as Error).message || "未知错误"}`,
            data: null
        });
    }
};


export const planListService = async (req: Request, res: Response) => {
    let isResponseSent = false;
    const safeResponse = (status: number, data: any) => {
        if (isResponseSent) return;
        isResponseSent = true;
        res.status(status).json(data);
    };
    try {
        // 1. 获取并转换所有参数（适配 YY-MM-DD 日期参数）
        const {
            userId,
            plan_type,
            planDate,
            planDateStart ,
            planDateEnd,
            page ,
            pageSize
        } = req.body;

        // 3. 调用列表方法（传入日期参数）
        const result = await planModule.list(
            userId,
            plan_type,
            planDate,
            planDateStart ,
            planDateEnd,
            page ,
            pageSize
        );

        // 4. 返回结果
        safeResponse(200, {
            code: 200,
            message: "查询成功",
            data: result
        });
    } catch (error) {
        console.error("查询计划列表接口异常：", error);
        safeResponse(500, {
            code: 500,
            message: `查询失败：${(error as Error).message}`,
            data: null
        });
    }
};





export const planByMonthService = async (req: Request, res: Response) => {
    let isResponseSent = false;
    const safeResponse = (status: number, data: any) => {
        if (isResponseSent) return;
        isResponseSent = true;
        res.status(status).json(data);
    };
    try {
        // 1. 获取并转换所有参数（适配 YY-MM-DD 日期参数）
        const {
            userId,
            startTime
        } = req.body;

        // 3. 调用列表方法（传入日期参数）
        const result = await planModule.planByMonth(
            userId,
            startTime
        );

        // 4. 返回结果
        safeResponse(200, {
            code: 200,
            message: "查询成功",
            data: result
        });
    } catch (error) {
        console.error("查询计划列表接口异常：", error);
        safeResponse(500, {
            code: 500,
            message: `查询失败：${(error as Error).message}`,
            data: null
        });
    }
};





export const removePlanService = async (req: Request, res: Response) => {
    let isResponseSent = false;
    const safeResponse = (status: number, data: any) => {
        if (isResponseSent) return;
        isResponseSent = true;
        res.status(status).json(data);
    };
    try {
        // 1. 获取并转换所有参数（适配 YY-MM-DD 日期参数）
        const {
            userId,
            planId,
        } = req.body;

        // 3. 调用列表方法（传入日期参数）
        const result = await planModule.removePlan(
            userId,
            planId
        );

        // 4. 返回结果
        safeResponse(200, {
            code: 200,
            message: "查询成功",
            data: result
        });
    } catch (error) {
        console.error("查询计划列表接口异常：", error);
        safeResponse(500, {
            code: 500,
            message: `查询失败：${(error as Error).message}`,
            data: null
        });
    }
};
export const planInfoService = async (req: Request, res: Response) => {
    let isResponseSent = false;
    const safeResponse = (status: number, data: any) => {
        if (isResponseSent) return;
        isResponseSent = true;
        res.status(status).json(data);
    };
    try {
        // 1. 获取并转换所有参数（适配 YY-MM-DD 日期参数）
        const {
            userId,
            planId,
        } = req.body;

        // 3. 调用列表方法（传入日期参数）
        const result = await planModule.getPlanDetail(
            userId,
            planId
        );

        // 4. 返回结果
        safeResponse(200, {
            code: 200,
            message: "查询成功",
            data: result
        });
    } catch (error) {
        console.error("查询计划列表接口异常：", error);
        safeResponse(500, {
            code: 500,
            message: `查询失败：${(error as Error).message}`,
            data: null
        });
    }
};
export const planUpdateService = async (req: Request, res: Response) => {
    try {
        // 1. 参数校验（基础非空校验，可根据业务扩展）
        const { userId, name, content, planTime, planType } = req.body;
        if (!userId || !name || !content || !planTime || !planType) {
            return res.status(400).json({
                code: 400,
                message: "参数缺失：userId/name/content/planTime/planType 为必填项",
                data: null
            });
        }

        // 2. 调用计划创建方法（await 等待异步执行完成）
        const result = await planModule.update(req.body);

        // 3. 返回成功响应
        return res.status(200).json({
            code: 200,
            message: "计划创建成功",
            data: result // 包含 planId 等信息
        });
    } catch (error) {
        // 4. 统一错误处理
        console.error("创建计划接口异常：", error);
        return res.status(500).json({
            code: 500,
            message: `计划创建失败：${(error as Error).message || "未知错误"}`,
            data: null
        });
    }
};

