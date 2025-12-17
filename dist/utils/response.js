import { HttpStatus } from '../types';
/**
 * 通用响应封装函数（带完整类型约束）
 * @param res - Express Response 对象
 * @param httpStatus - HTTP 状态码（推荐用 HttpStatus 枚举）
 * @param code - 业务状态码
 * @param message - 提示信息
 * @param data - 返回数据（泛型支持）
 */
export const sendResponse = (res, httpStatus, code, message, data = null) => {
    const responseBody = {
        code,
        message,
        data,
    };
    // 明确返回类型：Response<ApiResponse<T>>
    return res.status(httpStatus).json(responseBody);
};
// 封装常用快捷方法（带类型）
/** 成功响应（默认 200） */
export const sendSuccess = (res, message = "操作成功", data = null, code = HttpStatus.OK) => {
    return sendResponse(res, HttpStatus.OK, code, message, data);
};
/** 403 禁止访问响应 */
export const sendForbidden = (res, message = "无访问权限", data = null, code = HttpStatus.FORBIDDEN) => {
    return sendResponse(res, HttpStatus.FORBIDDEN, code, message, data);
};
/** 404 资源不存在响应 */
export const sendNotFound = (res, message = "资源不存在", data = null, code = HttpStatus.NOT_FOUND) => {
    return sendResponse(res, HttpStatus.NOT_FOUND, code, message, data);
};
/** 500 服务器错误响应 */
export const sendServerError = (res, message = "服务器内部错误", data = null, code = HttpStatus.INTERNAL_SERVER_ERROR) => {
    return sendResponse(res, HttpStatus.INTERNAL_SERVER_ERROR, code, message, data);
};
