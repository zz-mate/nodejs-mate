/**
 * 格式化日期为指定格式的字符串
 * @param dateValue - 日期值（Date对象、时间戳、日期字符串）
 * @param format - 目标格式，支持：
 *                 'YYYY-MM-DD'       - 年-月-日
 *                 'MM/DD'            - 月/日
 *                 'YYYY-MM-DD HH:mm' - 年-月-日 时:分
 *                 'YYYY-MM-DD HH:mm:ss' - 年-月-日 时:分:秒
 *                 'timestamp'        - 时间戳
 *                 默认返回 ISO 格式字符串
 * @returns 格式化后的日期字符串
 */
export function formatDate(dateValue, format = 'YYYY-MM-DD HH:mm:ss') {
    // 如果日期值为空，返回空字符串
    if (!dateValue)
        return '';
    // 创建 Date 对象
    const date = new Date(dateValue);
    // 处理无效日期
    if (isNaN(date.getTime())) {
        return String(dateValue); // 如果无法解析，返回原始值的字符串形式
    }
    // 获取日期各部分
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // 月份从0开始，补零到两位
    const day = String(date.getDate()).padStart(2, '0'); // 日期补零到两位
    const hours = String(date.getHours()).padStart(2, '0'); // 小时补零到两位
    const minutes = String(date.getMinutes()).padStart(2, '0'); // 分钟补零到两位
    const seconds = String(date.getSeconds()).padStart(2, '0'); // 秒补零到两位
    // 根据格式返回不同的日期字符串
    switch (format) {
        case 'YYYY-MM-DD':
            return `${year}-${month}-${day}`;
        case 'MM/DD':
            return `${month}/${day}`;
        case 'YYYY-MM-DD HH:mm':
            return `${year}-${month}-${day} ${hours}:${minutes}`;
        case 'HH:mm':
            return `${hours}:${minutes}`;
        case 'YYYY-MM-DD HH:mm:ss':
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        case 'DD':
            return `${date.getDate()}`;
        case 'timestamp':
            return String(date.getTime());
        default:
            return date.toISOString(); // 默认返回 ISO 格式
    }
}
