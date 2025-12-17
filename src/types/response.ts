/**
 * 统一的 API 响应体类型
 * T: data 字段的泛型类型，默认 null
 */
export interface ApiResponse<T = null> {
    // 业务状态码
    code: number;
    // 提示信息
    message: string;
    // 响应数据，支持泛型适配不同数据类型
    data: T;
}

/**
 * 分页元数据类型（包含分页核心信息）
 */
export interface PaginationMeta {
    // 当前页码（从1开始）
    page: number;
    // 每页条数
    pageSize: number;
    // 总数据条数
    total: number;
    // 总页数
    totalPage: number;
}

/**
 * 分页响应的 data 字段类型
 * T: 列表项的泛型类型
 */
export interface PaginationData<T = any> {
    // 数据列表
    list: T[];
    // 分页元数据
    pagination: PaginationMeta;
}

/**
 * 分页请求参数类型（前端传参时使用）
 */
export interface PaginationQuery {
    // 当前页码，默认1
    page?: number;
    // 每页条数，默认10
    pageSize?: number;
}

/**
 * 常用 HTTP 状态码枚举（可选，增强可读性）
 */
export enum HttpStatus {
    OK = 200,
    BAD_REQUEST = 400,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    INTERNAL_SERVER_ERROR = 500
}