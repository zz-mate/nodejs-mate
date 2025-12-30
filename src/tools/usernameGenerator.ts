/**
 * 记账App专属用户名生成工具
 * 支持基础随机/趣味理财主题/自定义规则/唯一用户名生成
 */
class UsernameGenerator {
  /**
   * 基础随机用户名（字母+数字组合）
   * @param length 用户名总长度，默认8位（前缀+随机数）
   * @param prefix 自定义前缀，默认'finance'（贴合记账场景）
   * @returns 格式化后的基础用户名
   */
  static basic(length: number = 8, prefix: string = "finance"): string {
    if (length <= prefix.length) {
      throw new Error("用户名长度需大于前缀长度");
    }
    // 生成指定长度的随机数字
    const numLength = length - prefix.length;
    const randomNum = Math.floor(Math.random() * Math.pow(10, numLength));
    // 补零保证长度一致（如finance123 → finance00123）
    const paddedNum = randomNum.toString().padStart(numLength, "0");
    return prefix + paddedNum;
  }

  /**
   * 记账主题趣味用户名（招财/攒钱等+吉利数字）
   * @returns 贴合理财场景的趣味用户名
   */
  static finance(): string {
    // 拓展：新增更多理财相关前缀（覆盖不同理财场景）
    const prefixList = [
      // 核心理财
      "招财",
      "攒钱",
      "理财",
      "小金库",
      "财务",
      "富盈",
      "金旺",
      // 收支管理
      "收支稳",
      "记账通",
      "算得清",
      "账无忧",
      "收支平",
      "零钱罐",
      // 目标导向
      "攒首付",
      "还房贷",
      "养钱包",
      "存嫁妆",
      "备学费",
      "养老钱",
      // 风格化前缀
      "轻理财",
      "简记账",
      "慢攒钱",
      "巧省钱",
      "智理财",
      "稳赚钱",
      // 吉利寓意
      "日进金",
      "月有余",
      "年有余",
      "节节高",
      "步步高",
      "万事盈",
    ];
    // 拓展：新增更多吉利数字/组合后缀
    const suffixList = [
      "88",
      "66",
      "99",
      "888",
      "666",
      "999",
      "088",
      "066",
      "099",
      "168",
      "188",
      "199",
      "520",
      "818",
      "919",
      "618",
      "816",
      "918",
      "777",
      "555",
      "333",
      "2025",
      "2026",
      "2027", // 年份/幸运数字
    ];
    // 随机选取前缀和后缀
    const randomPrefix =
      prefixList[Math.floor(Math.random() * prefixList.length)];
    const randomSuffix =
      suffixList[Math.floor(Math.random() * suffixList.length)];
    return randomPrefix + randomSuffix;
  }

  /**
   * 自定义规则用户名
   * @param options 配置项
   * @param options.type 字符类型：letter(纯字母)/number(纯数字)/mix(混合)/cn(中文)
   * @param options.length 长度（中文建议≤4）
   * @returns 自定义规则生成的用户名
   */
  static custom(
    options: {
      type?: "letter" | "number" | "mix" | "cn";
      length?: number;
    } = {}
  ): string {
    const { type = "mix", length = 6 } = options;
    // 字符池定义（大幅拓展）
    const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    // 拓展：新增更多记账/理财相关中文，分场景分类
    const cnWords = [
      // 核心词汇
      "财",
      "富",
      "攒",
      "省",
      "钱",
      "利",
      "盈",
      "旺",
      // 收支相关
      "收",
      "支",
      "余",
      "存",
      "贷",
      "还",
      "付",
      "结",
      // 工具相关
      "账",
      "单",
      "册",
      "记",
      "算",
      "核",
      "清",
      "查",
      // 吉利寓意
      "吉",
      "祥",
      "顺",
      "兴",
      "隆",
      "盛",
      "丰",
      "足",
      // 年轻化词汇
      "冲",
      "氪",
      "囤",
      "薅",
      "赚",
      "爆",
      "香",
      "爽",
    ];

    let charPool = "";
    let finalLength = length;

    // 按类型选择字符池
    switch (type) {
      case "letter":
        charPool = letters;
        break;
      case "number":
        charPool = numbers;
        break;
      case "cn":
        charPool = cnWords.join("");
        finalLength = Math.min(length, 4); // 中文用户名限制最大4字
        break;
      default: // mix
        charPool = letters + numbers;
    }

    // 生成随机字符
    let result = "";
    for (let i = 0; i < finalLength; i++) {
      const randomIndex = Math.floor(Math.random() * charPool.length);
      result += charPool[randomIndex];
    }
    return result;
  }

  /**
   * 生成唯一用户名（结合数据库查重）
   * @param checkExist 查重函数（异步，返回是否存在）
   * @param maxRetry 最大重试次数，默认5
   * @returns 确保唯一的用户名
   */
  static async unique(
    checkExist: (username: string) => Promise<boolean>,
    maxRetry: number = 5
  ): Promise<string> {
    let retry = 0;
    let username = this.finance();

    // 重试直到找到唯一用户名或达到最大次数
    while (retry < maxRetry) {
      const exist = await checkExist(username);
      if (!exist) break;
      // 重复则追加随机数（提升唯一性）
      username = this.finance() + Math.floor(Math.random() * 100);
      retry++;
    }

    return username;
  }
}

// 导出类型和工具类
export type UsernameType = "letter" | "number" | "mix" | "cn";
export type UsernameOptions = {
  type?: UsernameType;
  length?: number;
};
export default UsernameGenerator;
