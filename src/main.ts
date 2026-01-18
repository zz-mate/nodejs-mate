import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import config from './config';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import logger, { httpLoggerMiddleware } from './middlewares/logger.middleware';

import { initOSSClient } from './tools/oss';
// 1. 加载环境变量
dotenv.config();
// 初始化订阅模块


// 2. 初始化 OSS 客户端（pnpm 环境下无需修改）
const getEnvVariable = (key: string): string => {
    const value = process.env[key];
    if (!value) {
        throw new Error(`环境变量 ${key} 未配置，请检查 .env 文件`);
    }
    return value;
};

initOSSClient({
    accessKeyId: getEnvVariable('OSS_ACCESS_KEY_ID'),
    accessKeySecret: getEnvVariable('OSS_ACCESS_KEY_SECRET'),
    bucket: getEnvVariable('OSS_BUCKET'),
    region: getEnvVariable('OSS_REGION'),
    // endpoint:getEnvVariable('OSS_ENDPOINT')
});
// 创建Express实例
const app = express();

// 日志中间件放在最前面
app.use(httpLoggerMiddleware);

// 全局中间件
app.use(cors());
app.use(express.json());
app.use(express.raw({ type: 'application/xml', limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// 🔥 优化1：启动日志改为纯文本，无对象
logger.info(`✅ 应用初始化完成 | 环境: ${config.nodeEnv} | 端口: ${config.port} | 数据库：${process.env.DB_NAME}`);

// 挂载路由
app.use('/api/v1', routes);

// 错误处理中间件
app.use(notFoundHandler);
app.use(errorHandler);

// 启动服务器
const PORT = config.port;
app.listen(PORT, () => {
    // 🔥 优化2：服务器启动日志改为纯文本
    logger.info(`🚀 服务器启动成功 | 运行模式: ${config.nodeEnv} | 访问地址: http://localhost:${PORT} | 进程ID: ${process.pid}`);
});

// 🔥 优化3：异常日志改为纯文本格式
process.on('uncaughtException', (err) => {
    logger.error(`🆘 未捕获的全局异常 | 消息: ${err.message} | 时间: ${new Date().toISOString()}\n${err.stack || '无调用栈信息'}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    const reasonMsg = reason instanceof Error ? reason.message : String(reason);
    const reasonStack = reason instanceof Error ? reason.stack || '无调用栈信息' : '无调用栈信息';
    logger.error(`🆘 未处理的Promise拒绝 | 原因: ${reasonMsg} | 时间: ${new Date().toISOString()}\n${reasonStack}`);
});