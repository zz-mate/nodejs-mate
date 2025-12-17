/**
 * 通用非空校验函数
 * @param data 待校验的数据对象（如 req.body）
 * @param requiredFields 需要校验的必填字段列表
 * @param customMessages 自定义字段提示文案（可选，如 { user_id: '用户ID' }）
 * @returns 校验结果
 */
export function checkRequiredFields(data, requiredFields, customMessages = {}) {
    // 存储为空的字段名
    const emptyFields = [];
    // 遍历所有必填字段进行校验
    for (const field of requiredFields) {
        const value = data[field];
        // 判定为空的情况：undefined | null | 空字符串 | 空数组 | 空对象
        const isEmpty = value === undefined ||
            value === null ||
            (typeof value === 'string' && value.trim() === '') ||
            (Array.isArray(value) && value.length === 0) ||
            (typeof value === 'object' && Object.keys(value).length === 0);
        if (isEmpty) {
            emptyFields.push(field);
        }
    }
    // 构造返回结果
    const pass = emptyFields.length === 0;
    return {
        pass,
        emptyFields,
        message: pass
            ? ''
            : `必填字段不能为空：${emptyFields.map(field => customMessages[field] || field).join('、')}`
    };
}
// ==================== 扩展：简化的抛出异常版本（更易用） ====================
/**
 * 非空校验（校验失败直接抛异常）
 * @param data 待校验数据
 * @param requiredFields 必填字段列表
 * @param customMessages 自定义字段文案
 * @throws BusinessError 校验失败时抛出业务异常
 */
export function validateRequiredFields(data, requiredFields, customMessages = {}) {
    const result = checkRequiredFields(data, requiredFields, customMessages);
    if (!result.pass) {
        // @ts-ignore
        throw new (typeof BusinessError !== 'undefined' ? BusinessError : Error)(result.message, 400);
    }
}
