import mysql from "mysql2/promise";
import dotenv from 'dotenv';

// 加载环境变量（优先从.env文件读取）
dotenv.config();

// 数据库配置（带类型安全，避免NaN等错误）
const config = {
    host: process.env.DB_HOST || 'localhost',
    // 严格校验端口类型，非数字则强制用3306
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'local_mate_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // 保留时区和类型转换（解决时间差/TS类型问题）
    timezone: '+08:00',
    typeCast: true,
    charset: 'utf8mb4'
};

// 校验关键配置（避免启动后报错）
if (isNaN(config.port)) {
    throw new Error(`数据库端口配置错误：process.env.DB_PORT = ${process.env.DB_PORT}，必须为数字`);
}
if (!config.database) {
    throw new Error('数据库名称（DB_NAME）未配置，请检查.env文件');
}

// 创建全局连接池（单例）
const pool = mysql.createPool(config);

/**
 * 测试数据库连接（自动执行）
 */
// const testDBConnection = async () => {
//     try {
//         const [rows] = await pool.execute('SELECT 1 + 1 AS result');
//         console.log(`✅ 数据库连接测试成功 [${process.env.NODE_ENV || 'unknown'}环境]`, rows);
//     } catch (err) {
//         console.error(`❌ 数据库连接测试失败 [${process.env.NODE_ENV || 'unknown'}环境]`, err);
//         // 开发环境终止进程，生产环境可根据需求调整
//         if (process.env.NODE_ENV === 'development') {
//             process.exit(1);
//         }
//     }
// };

// 根据环境输出日志 + 自动测试连接
if (process.env.NODE_ENV === "development") {
    console.log("🌈🌈🌈 正在 [开发环境] 中初始化数据库连接池...");
} else if (process.env.NODE_ENV === "production") {
    console.log("🌈🌈🌈 正在 [生产环境] 中初始化数据库连接池...");
}
// 打印配置（脱敏密码，避免日志泄露敏感信息）
// console.log('📋 数据库配置：', {
//     ...config,
//     password: config.password ? '******' : '未配置' // 密码脱敏
// });

// 自动执行连接测试
// testDBConnection();

// 导出常用类型 + 连接池（保持TS类型提示）
export type DBResult = mysql.RowDataPacket[] | mysql.RowDataPacket[][] | mysql.OkPacket | mysql.OkPacket[] | mysql.ResultSetHeader;
export type DBConnection = mysql.PoolConnection;

// 默认导出连接池（核心）
export default pool;