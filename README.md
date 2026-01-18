# nodejs-mate
// 1. 配置备忘录订阅（一次性）
await setSubscribeSchedule(
'o6_bmjrPTlm6_2sgVt7hMZOPfL2M', // openid
SubscribeType.PLAN, // 订阅类型
'2026-01-20 14:30:00', // 发送时间
'1001' // 备忘录ID（sourceId）
);

// 2. 配置记账订阅（周期性）
await setSubscribeSchedule(
'o6_bmjrPTlm6_2sgVt7hMZOPfL2M',
SubscribeType.JI_ZHANG,
'08:00' // 每日8点触发
);

// 3. 即时发送消费提醒
await sendSubscribe({
openid: 'o6_bmjrPTlm6_2sgVt7hMZOPfL2M',
type: SubscribeType.XIAO_FEI,
params: {
billNo: 'XF20260117001',
consumeItem: '星巴克咖啡',
amount: 38,
consumeTime: '2026-01-17 10:00:00'
},
sourceId: '2001'
});

// 4. 取消备忘录订阅
await cancelSubscribeSchedule(
'o6_bmjrPTlm6_2sgVt7hMZOPfL2M',
SubscribeType.PLAN,
'1001'
);