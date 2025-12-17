/**
 * 金额格式化函数：保留两位小数（适配账单/财务场景）
 * @param amount 待格式化的金额（支持数字/字符串类型）
 * @param returnType 返回类型：'number'（数字）| 'string'（字符串，默认）
 * @returns 保留两位小数的金额
 */
export function formatAmount  (amount: number | string,returnType: 'number' | 'string' = 'string'): number | string {
    // 1. 空值/非有效值处理
    if (amount === null || amount === undefined || amount === '') {
        return returnType === 'number' ? 0 : '0.00';
    }

    // 2. 转换为数字（处理字符串类型输入）
    let num = Number(amount);
    // 非数字处理（如传入非数字字符串）
    if (isNaN(num)) {
        return returnType === 'number' ? 0 : '0.00';
    }

    // 3. 保留两位小数（四舍五入）
    const formattedNum = Number(num.toFixed(2));

    // 4. 根据返回类型返回结果
    if (returnType === 'number') {
        return formattedNum;
    } else {
        // 字符串类型确保两位小数（如1200 → "1200.00"，避免1200.0 → "1200"）
        return formattedNum.toFixed(2);
    }
}


/**
 * JSON 字符串转数组对象（带容错）
 * @param {string} jsonStr - 原始JSON字符串
 * @returns {Array} 解析后的数组对象（失败返回空数组）
 */
export function parseJsonToArray(jsonStr: string) {
    // 第一步：处理空值/非字符串
    if (!jsonStr) {
        return [];
    }

    try {
        // 第二步：解析为数组对象
        const result = JSON.parse(jsonStr);
        // 第三步：确保返回的是数组（避免解析后不是数组的情况）
        return Array.isArray(result) ? result : [];
    } catch (error) {
        console.warn('JSON 解析异常：', error, '原始字符串：', jsonStr);
        return []; // 解析失败返回空数组
    }
}


/**
 * 手机号中间四位脱敏
 * @param phone 11 位中国大陆手机号
 * @returns 脱敏后的手机号，如 138****1234
 */
export function maskPhoneNumber(phone: string): string {
    // 校验是否为 11 位数字手机号
    if (!/^1\d{10}$/.test(phone)) {
        throw new Error('请传入有效的 11 位手机号');
    }
    // 保留前 3 位和后 4 位，中间替换为 ****
    return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}