import dotenv from 'dotenv';
dotenv.config();

// 环境变量类型校验
const config = {
    // 服务器配置
    port: process.env.PORT ? Number(process.env.PORT) : 3000,
    nodeEnv: process.env.NODE_ENV || 'development',

    // 数据库配置（核心）
    db: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'express_ts_demo',
        charset: process.env.DB_CHARSET || 'utf8mb4',
        connectionLimit: process.env.DB_CONNECTION_LIMIT ? Number(process.env.DB_CONNECTION_LIMIT) : 10,
    },
};

// 校验数据库配置（避免启动时报错）
if (!config.db.database) throw new Error('DB_NAME is required in .env');
if (isNaN(config.db.port)) throw new Error('DB_PORT must be a number');

export default config;