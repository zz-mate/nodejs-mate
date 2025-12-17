import { Response } from 'express';

/**
 * 统一响应格式类型定义
 */
export interface ApiResponse<T = any> {
    /** 业务状态码：0=成功，非0=失败（可自定义） */
    code: number;
    /** 提示信息 */
    message: string;
    /** 响应数据 */
    data: T;
    /** 请求ID（可选，用于排查问题） */
    requestId?: string;
    /** 时间戳 */
    timestamp: number;
}

/**
 * 生成请求ID（可选）
 */
const generateRequestId = (): string => {
    return Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
};

/**
 * 成功响应
 * @param res Express Response 对象
 * @param data 响应数据（可选）
 * @param message 提示信息（默认：操作成功）
 * @param code 业务码（默认：0）
 * @returns Express Response
 */
export const success = <T = null>(
    res: Response,
    data: T = null as T,
    message: string = '操作成功',
    code: number = 0
): Response => {
    const response: ApiResponse<T> = {
        code,
        message,
        data,
        requestId: generateRequestId(),
        timestamp: Date.now()
    };
    return res.status(200).json(response);
};

/**
 * 失败响应
 * @param res Express Response 对象
 * @param message 错误提示
 * @param status HTTP状态码（默认：400）
 * @param code 业务码（默认：和HTTP状态码一致）
 * @param data 附加数据（可选）
 * @returns Express Response
 */
export const fail = <T = null>(
    res: Response,
    message: string = '操作失败',
    status: number = 400,
    code: number = status,
    data: T = null as T,
): Response => {
    const response: ApiResponse<T> = {
        code,
        message,
        data,
        requestId: generateRequestId(),
        timestamp: Date.now()
    };
    return res.status(status).json(response);
};

/**
 * 分页响应（通用分页格式）
 * @param res Express Response 对象
 * @param list 数据列表
 * @param total 总条数
 * @param page 页码（默认：1）
 * @param size 页大小（默认：10）
 * @param message 提示信息（默认：查询成功）
 * @returns Express Response
 */
export const paginate = <T = any>(
    res: Response,
    list: T[],
    total: number,
    page: number = 1,
    size: number = 10,
    message: string = '查询成功'
): Response => {
    const response: ApiResponse<{
        list: T[];
        pagination: {
            page: number;
            size: number;
            total: number;
            totalPage: number;
        };
    }> = {
        code: 0,
        message,
        data: {
            list,
            pagination: {
                page,
                size,
                total,
                totalPage: Math.ceil(total / size)
            }
        },
        requestId: generateRequestId(),
        timestamp: Date.now()
    };
    return res.status(200).json(response);
};