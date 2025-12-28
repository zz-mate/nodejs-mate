import dotenv from 'dotenv';
import path from 'path';

// 核心：根据 NODE_ENV 自动加载对应环境的 .env 文件
const env = process.env.NODE_ENV || 'development';
dotenv.config({
    path: path.resolve(process.cwd(), `.env.${env}`) // 绝对路径避免加载异常
});

// 环境变量类型校验 & 多环境默认值区分
const config = {
    // 服务器配置
    port: process.env.PORT ? Number(process.env.PORT) : (env === 'production' ? 9870 : 9875),
    nodeEnv: env,

    // 数据库配置（开发/生产环境默认值严格隔离）
    db: {
        host: process.env.DB_HOST || (env === 'production' ? 'prod-db-host' : 'localhost'),
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
        user: process.env.DB_USER || (env === 'production' ? 'prod_db_user' : 'root'),
        password: process.env.DB_PASSWORD || (env === 'production' ? 'prod_db_pwd' : ''),
        database: process.env.DB_NAME || (env === 'production' ? 'local_mate_prod' : 'local_mate_test'),
        charset: process.env.DB_CHARSET || 'utf8mb4',
        connectionLimit: process.env.DB_CONNECTION_LIMIT ? Number(process.env.DB_CONNECTION_LIMIT) : 10,
    },
};

// 严格的配置校验（提前暴露错误）
const validateConfig = () => {
    if (!config.db.database) throw new Error('❌ 环境变量 DB_NAME 不能为空（请检查 .env 文件）');
    if (isNaN(config.db.port)) throw new Error('❌ 环境变量 DB_PORT 必须是数字类型');
    if (isNaN(config.port)) throw new Error('❌ 环境变量 PORT 必须是数字类型');
};

// 执行配置校验
validateConfig();

// ES6 默认导出
export default config;