import { createLogger, format, transports, type Logger } from 'winston';
import 'winston-daily-rotate-file';
import { join } from 'path';
import fs from 'fs';
import type { Request, Response, NextFunction } from 'express';

// ========== 核心：环境区分 ==========
const NODE_ENV = process.env.NODE_ENV || 'local';
const envList = ['local', 'development', 'production'] as const;
type EnvType = (typeof envList)[number];

const isLocal = NODE_ENV === 'local';
const isDev = NODE_ENV === 'development';
const isProd = NODE_ENV === 'production';

if (!envList.includes(NODE_ENV as EnvType)) {
    throw new Error(`❌ 无效的 NODE_ENV: ${NODE_ENV}，仅支持 ${envList.join('/')}`);
}

// ========== 日志目录 ==========
const getLogDir = () => {
    return join(process.cwd(), 'logs', NODE_ENV);
};

// ========== 类型定义 ==========
export type LogLevel = 'silly' | 'debug' | 'verbose' | 'info' | 'warn' | 'error';

export interface LoggerConfig {
    logDir: string;
    level: LogLevel;
    maxSize: string;
    maxFiles: string | number;
    enableHttpLogging?: boolean;
    datePattern?: string;
    env: EnvType;
    consoleFormat?: 'simple' | 'json' | 'verbose';
    enableFileLogging?: boolean;
}

// ========== 默认配置 ==========
const DEFAULT_CONFIG: LoggerConfig = {
    logDir: getLogDir(),
    level: isLocal ? 'silly' : isDev ? 'debug' : 'info',
    maxSize: isLocal ? '2m' : isDev ? '5m' : '20m',
    maxFiles: isLocal ? '7d' : isDev ? '14d' : '30d',
    enableHttpLogging: true,
    datePattern: 'YYYY-MM-DD',
    env: NODE_ENV as EnvType,
    consoleFormat: isLocal ? 'verbose' : isDev ? 'simple' : 'json',
    enableFileLogging: isLocal ? false : true
};

// ========== 工具函数 ==========
const ensureLogDir = (dir: string): void => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[Logger] 日志目录已创建: ${dir}`);
    }
};

// ========== 自定义PID格式 ==========
const addPidFormat = format((info) => {
    info.pid = process.pid;
    return info;
});

// ========== 新增：安全格式化工具函数（核心修复） ==========
/**
 * 安全格式化任意值为JSON字符串（避免undefined/null）
 * @param value 要格式化的值
 * @param maxLength 最大长度（截断）
 * @returns 安全的JSON字符串
 */
const safeJsonStringify = (value: any, maxLength = 200): string => {
    try {
        // 处理undefined/null/空值
        if (value === undefined || value === null) return '{}';
        // 处理非对象类型（如字符串/数字）
        if (typeof value !== 'object') return JSON.stringify(value).substring(0, maxLength);
        // 处理对象/数组（避免循环引用）
        const jsonStr = JSON.stringify(value, (_, val) => {
            // 处理循环引用
            if (typeof val === 'object' && val !== null) {
                if (cache.has(val)) return '[Circular]';
                cache.add(val);
            }
            return val;
        });
        const cache = new WeakSet(); // 解决循环引用问题
        return jsonStr.substring(0, maxLength);
    } catch (err) {
        // 格式化失败时返回占位符
        return '[Format Error]';
    }
};

// ========== 日志格式 ==========
const localConsoleFormat = format.combine(
    addPidFormat(),
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.colorize({ all: true }),
    format.label({ label: 'LOCAL-DEV' }),
    format.printf(({ timestamp, pid, label, level, message }) => {
        return `[${timestamp}] [${label}] [PID:${pid}] [${level}] ${message}`;
    })
);

const devConsoleFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.colorize({ all: true }),
    format.printf(({ timestamp, level, message }) => {
        return `[${timestamp}] [${level}] ${message}`;
    })
);

const prodConsoleFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.json()
);

// ========== 创建核心日志实例 ==========
const createCoreLogger = (config: LoggerConfig = DEFAULT_CONFIG): Logger => {
    if (config.enableFileLogging) {
        ensureLogDir(config.logDir);
    }

    const baseFileFormat = format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        format.errors({ stack: true }),
        format.json(),
        format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] })
    );

    // @ts-ignore
    const transportList: transports.Transport[] = [
        new transports.Console({
            level: config.level,
            format: config.consoleFormat === 'verbose'
                ? localConsoleFormat
                : config.consoleFormat === 'simple'
                    ? devConsoleFormat
                    : prodConsoleFormat,
            silent: false
        })
    ];

    if (config.enableFileLogging) {
        // 普通日志文件
        transportList.push(
            new transports.DailyRotateFile({
                filename: join(config.logDir, 'app-%DATE%.log'),
                datePattern: isLocal ? 'YYYY-MM-DD-HH' : config.datePattern,
                maxSize: config.maxSize,
                maxFiles: config.maxFiles,
                level: isLocal ? 'silly' : 'info',
                format: baseFileFormat,
                zippedArchive: isProd,
                utc: false,
                createSymlink: isLocal,
                symlinkName: 'app-latest.log'
            }),
            // 错误日志文件
            new transports.DailyRotateFile({
                filename: join(config.logDir, 'error-%DATE%.log'),
                datePattern: isLocal ? 'YYYY-MM-DD-HH' : config.datePattern,
                maxSize: config.maxSize,
                maxFiles: isLocal ? '3d' : isDev ? '30d' : '90d',
                level: 'error',
                format: baseFileFormat,
                zippedArchive: isProd,
                utc: false,
                createSymlink: isLocal,
                symlinkName: 'error-latest.log'
            })
        );

        // Local/Dev 专属 Debug 日志
        if (isLocal || isDev) {
            transportList.push(
                new transports.DailyRotateFile({
                    filename: join(config.logDir, 'debug-%DATE%.log'),
                    datePattern: isLocal ? 'YYYY-MM-DD-HH' : 'YYYY-MM-DD',
                    maxSize: isLocal ? '1m' : '5m',
                    maxFiles: isLocal ? '1d' : '7d',
                    level: 'debug',
                    format: baseFileFormat,
                    zippedArchive: false,
                    utc: false,
                    createSymlink: isLocal,
                    symlinkName: 'debug-latest.log'
                })
            );
        }
    }

    return createLogger({
        level: config.level,
        defaultMeta: {
            env: config.env,
            app: 'mate',
            localDev: isLocal,
            pid: process.pid
        },
        transports: transportList,
        silent: false,
        exitOnError: false,
        // 异常捕获
        exceptionHandlers: isLocal
            ? [new transports.Console({ format: localConsoleFormat })]
            : [new transports.DailyRotateFile({
                filename: join(config.logDir, 'exceptions-%DATE%.log'),
                datePattern: config.datePattern,
                format: baseFileFormat
            })]
    });
};

// ========== 初始化日志实例 ==========
const coreLogger = createCoreLogger();

// ========== 封装日志方法 ==========
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
    // Local 专属：打印对象
    logObj: (label: string, obj: any): void => {
        if (isLocal) {
            coreLogger.silly(`[OBJ-${label}] ${safeJsonStringify(obj, 500)}`); // 使用安全格式化
        }
    },
    setLevel: (level: LogLevel): void => {
        coreLogger.level = level;
        coreLogger.transports.forEach((transport) => {
            if (transport instanceof transports.Console) {
                transport.level = level;
            }
        });
    },
    test: () => {
        coreLogger.info(`测试日志：服务器基础功能正常 | 环境: ${NODE_ENV} | 本地开发模式: ${isLocal} | PID: ${process.pid}`);
    }
};

// ========== HTTP日志中间件（核心修复：使用safeJsonStringify） ==========
export const createHttpLoggerMiddleware = (config: LoggerConfig = DEFAULT_CONFIG) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!config.enableHttpLogging) {
            return next();
        }

        const start = Date.now();
        const { method, originalUrl, ip, headers, body, query } = req;

        res.on('finish', () => {
            try { // 新增：捕获日志构建过程中的异常
                const duration = Date.now() - start;
                const { statusCode, statusMessage } = res;

                let logMessage: string | object;

                if (isLocal) {
                    // 修复核心：使用safeJsonStringify替代直接JSON.stringify
                    logMessage = `[LOCAL-HTTP] ${statusCode} ${statusMessage} | ${method} ${originalUrl} | 耗时: ${duration}ms | IP: ${ip || headers['x-forwarded-for'] || 'UNKNOWN'} | Query: ${safeJsonStringify(query)} | Body: ${safeJsonStringify(body)}`;
                } else if (isDev) {
                    // Dev：简洁日志
                    logMessage = `HTTP ${statusCode} | ${method} ${originalUrl} | 耗时: ${duration}ms | IP: ${ip || headers['x-forwarded-for'] || 'UNKNOWN'}`;
                } else {
                    // Prod：JSON格式
                    logMessage = JSON.stringify({
                        type: 'http',
                        env: config.env,
                        timestamp: new Date().toISOString(),
                        method,
                        url: originalUrl,
                        statusCode,
                        duration: `${duration}ms`,
                        ip: ip || headers['x-forwarded-for'] || 'UNKNOWN'
                    });
                }

                if (statusCode >= 500) {
                    baseLogger.error(logMessage);
                } else if (statusCode >= 400) {
                    baseLogger.warn(logMessage);
                } else {
                    if (isLocal || isDev) {
                        baseLogger.info(logMessage);
                    }
                }
            } catch (logErr) {
                // 日志构建失败时降级记录基础信息
                baseLogger.error(`HTTP日志构建失败：${(logErr as Error).message} | 路径：${req.originalUrl} | 方法：${req.method}`);
            }
        });

        next();
    };
};

// ========== 导出 ==========
export default baseLogger;
export const httpLoggerMiddleware = createHttpLoggerMiddleware(DEFAULT_CONFIG);
export const createCustomHttpLogger = createHttpLoggerMiddleware;

// 启动测试
if (isLocal) {
    baseLogger.silly(`🚀 本地开发模式已启动 - 日志级别：silly | 控制台详细输出 | PID: ${process.pid}`);
}
baseLogger.test();