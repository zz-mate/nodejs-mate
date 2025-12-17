import mysql from "mysql2/promise";
import dotenv from 'dotenv';
dotenv.config();

let config =  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'local_mate_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
}
// 创建连接池
const pool = mysql.createPool(config);

// 开发环境自动测试
if (process.env.NODE_ENV === "development") {
    console.log("🌈🌈🌈 正在 [开发环境] 中执行数据库连接测试...");
}else if(process.env.NODE_ENV === "production") {
    console.log("🌈🌈🌈 正在 [生产环境] 中执行数据库连接测试...");
}


export default pool;
// mysql -u root -p'/)R-QeytS2rK'
// mysql -u root -p'Root@123456'