// 定义自定义错误类，继承自原生 Error
 class HttpError extends Error {
    // 新增 status 字段存储 HTTP 状态码
    public status: number;
    // 可选：新增 code 字段存储业务错误码
    public code?: number;

    constructor(message: string, status: number, code?: number) {
        super(message); // 调用父类构造函数，传递错误信息
        this.status = status; // 赋值状态码
        this.code = code;
        // 修复 TypeScript 中自定义 Error 的原型链问题
        Object.setPrototypeOf(this, HttpError.prototype);
    }
}

export default HttpError;