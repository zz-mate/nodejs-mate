/** 用户信息表实体 */
export interface UserProfile {
    id: number;
    userId: number; // 关联用户ID
    level: number; // 用户等级（1-10）
    levelExp: number; // 等级经验值
    registerTime: Date; // 注册时间
    lastLoginTime?: Date; // 最后登录时间
    totalUsedDays: number; // 累计使用天数
    continuousUsedDays: number; // 连续使用天数
    totalBillCount: number; // 累计记账笔数
    monthBillCount: number; // 当月记账笔数
    totalIncome: number; // 累计收入
    totalExpense: number; // 累计支出
    totalBookCount: number; // 累计账本数
    favoriteCategoryIds: string; // 常用分类ID（逗号分隔）
    isVip: 0 | 1; // 是否VIP
    vipExpireTime?: Date; // VIP过期时间
    remark: string; // 备注
    createdAt: Date; // 创建时间
    updatedAt: Date; // 更新时间
    isDeleted: 0 | 1; // 软删除
}