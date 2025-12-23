import { createLogger, format, transports, type Logger } from 'winston';
import { join } from 'path';
import fs from 'fs';
import type { Request, Response, NextFunction } from 'express';

// 日志目录
const getLogDir = () => {
    return join(process.cwd(), 'logs');
};

// 日志级别类型
export type LogLevel = 'silly' | 'debug' | 'verbose' | 'info' | 'warn' | 'error';

// 日志配置接口
export interface LoggerConfig {
    logDir: string;
    level: LogLevel;
    maxSize: string;
    maxFiles: number;
    enableHttpLogging?: boolean;
}

// 默认配置
const DEFAULT_CONFIG: LoggerConfig = {
    logDir: getLogDir(),
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    maxSize: '20m',
    maxFiles: process.env.NODE_ENV === 'production' ? 30 : 14,
    enableHttpLogging: true
};

// 确保日志目录存在
const ensureLogDir = (dir: string): void => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

// 🔥 核心修改：控制台只输出纯文本，无JSON对象
const consoleLogFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.colorize({ all: true }),
    format.printf(({ timestamp, level, message }) => {
        // 仅保留时间、级别、纯文本消息
        return `[${timestamp}] [${level}] ${message}`;
    })
);

// 创建日志实例
const createCoreLogger = (config: LoggerConfig = DEFAULT_CONFIG): Logger => {
    ensureLogDir(config.logDir);

    return createLogger({
        level: config.level,
        format: format.combine(
            format.timestamp(),
            format.errors({ stack: true })
        ),
        transports: [
            new transports.Console({
                level: config.level,
                format: consoleLogFormat,
                silent: false
            }),
            new transports.File({
                filename: join(config.logDir, 'app.log'),
                maxsize: 20 * 1024 * 1024,
                maxFiles: config.maxFiles,
                level: 'info',
                format: format.combine(format.json())
            }),
            new transports.File({
                filename: join(config.logDir, 'error.log'),
                maxsize: 20 * 1024 * 1024,
                maxFiles: 30,
                level: 'error',
                format: format.combine(format.json())
            })
        ],
        silent: false,
        exitOnError: false
    });
};

// 创建核心日志实例
const coreLogger = createCoreLogger();

// 封装日志方法（只接收纯文本消息，无元数据参数）
const baseLogger = {
    debug: (message: string): void => {
        coreLogger.debug(message);
    },
    info: (message: string): void => {
        coreLogger.info(message);
    },
    warn: (message: string): void => {
        coreLogger.warn(message);
    },
    error: (message: string): void => {
        coreLogger.error(message);
    },
    verbose: (message: string): void => {
        coreLogger.verbose(message);
    },
    silly: (message: string): void => {
        coreLogger.silly(message);
    },
    setLevel: (level: LogLevel): void => {
        coreLogger.level = level;
        coreLogger.transports.forEach(transport => {
            if (transport instanceof transports.Console) {
                transport.level = level;
            }
        });
    },
    test: () => {
        coreLogger.info('测试日志：服务器基础功能正常');
    }
};

// HTTP日志中间件（输出纯文本HTTP日志）
export const createHttpLoggerMiddleware = (config: LoggerConfig = DEFAULT_CONFIG) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!config.enableHttpLogging) {
            return next();
        }

        const start = Date.now();
        const { method, originalUrl, ip, headers } = req;

        res.on('finish', () => {
            const duration = Date.now() - start;
            const { statusCode, statusMessage } = res;

            // 🔥 构建纯文本HTTP日志消息
            const logMessage = `HTTP ${statusCode} ${statusMessage} | ${method || 'UNKNOWN'} |  ${originalUrl || 'UNKNOWN'} | 耗时: ${duration}ms | IP: ${ip || headers['x-forwarded-for'] || headers['remote-addr'] || 'UNKNOWN'} | UA: ${headers['user-agent'] || 'UNKNOWN'}`;

            if (statusCode >= 500) {
                baseLogger.error(logMessage);
            } else if (statusCode >= 400) {
                baseLogger.warn(logMessage);
            } else {
                baseLogger.info(logMessage);
            }
        });

        next();
    };
};

// 导出
export default baseLogger;
export const httpLoggerMiddleware = createHttpLoggerMiddleware(DEFAULT_CONFIG);
export const createCustomHttpLogger = createHttpLoggerMiddleware;

// 启动测试
baseLogger.test();