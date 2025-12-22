import mysql from "mysql2/promise";
import dotenv from 'dotenv';

// 加载环境变量（优先从.env文件读取）
dotenv.config();

// 数据库配置（仅保留mysql2原生支持的参数）
const config = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'local_mate_db',
    // ✅ 仅保留mysql2原生支持的有效参数
    connectTimeout: 10000, // 连接建立超时（mysql2原生支持）
    waitForConnections: true, // 连接池无可用连接时是否等待
    connectionLimit: 10,   // 连接池最大连接数
    queueLimit: 0,         // 连接请求队列上限（0=无限制）
    enableKeepAlive: true, // 保持TCP连接活跃
    keepAliveInitialDelay: 30000, // 心跳包发送延迟
    timezone: '+08:00',    // 时区配置
    typeCast: true,        // 类型转换
    charset: 'utf8mb4'     // 字符集
};

// 校验关键配置
if (isNaN(config.port)) {
    throw new Error(`数据库端口配置错误：process.env.DB_PORT = ${process.env.DB_PORT}，必须为数字`);
}
if (!config.database) {
    throw new Error('数据库名称（DB_NAME）未配置，请检查.env文件');
}

// 创建全局连接池（单例）
const pool = mysql.createPool(config);

/**
 * 封装带超时的连接获取方法（替代acquireTimeout）
 * @param timeout 超时时间（毫秒），默认10秒
 */
export const getConnectionWithTimeout = async (timeout = 10000) => {
    // 使用Promise.race实现获取连接超时控制
    return Promise.race([
        pool.getConnection(),
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`获取数据库连接超时（${timeout}ms）`)), timeout)
        )
    ]);
};

/**
 * 测试数据库连接（自动执行）
 */
// const testDBConnection = async () => {
//     try {
//         const [rows] = await pool.execute('SELECT 1 + 1 AS result');
//         console.log(`✅ 数据库连接测试成功 [${process.env.NODE_ENV || 'unknown'}环境]`, rows);
//     } catch (err) {
//         console.error(`❌ 数据库连接测试失败 [${process.env.NODE_ENV || 'unknown'}环境]`, err);
//         if (process.env.NODE_ENV === 'development') {
//             process.exit(1);
//         }
//     }
// };

// 环境日志
if (process.env.NODE_ENV === "development") {
    console.log("🌈🌈🌈 正在 [开发环境] 中初始化数据库连接池...");
} else if (process.env.NODE_ENV === "production") {
    console.log("🌈🌈🌈 正在 [生产环境] 中初始化数据库连接池...");
}

// 自动执行连接测试
// testDBConnection();

// 导出类型和连接池
export type DBResult = mysql.RowDataPacket[] | mysql.RowDataPacket[][] | mysql.OkPacket | mysql.OkPacket[] | mysql.ResultSetHeader;
export type DBConnection = mysql.PoolConnection;

export default pool;