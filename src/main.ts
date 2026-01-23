<<<<<<< HEAD

import express,{type Application} from "express"; // 导入值（express 是函数/对象）
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
// @ts-ignore
import routes from "./routes/index.ts"

// 测试代码
// 显式指定 app 类型为 Application
const app: Application =
    express();

// 中间件
app.use(cors());
app.use(express.json());

app.use('/api/v1', routes);
const PORT = process.env.PORT || 9876;
app.listen(PORT , () => {
    console.log(`✅✅✅ 服务器已启动：http://localhost:${PORT} ✅✅✅`);
=======
import express from 'express';
import cors from 'cors';
import config from './config';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';

// 创建Express实例
const app = express();

// 全局中间件
app.use(cors()); // 允许跨域
app.use(express.json()); // 解析JSON请求体
app.use(express.urlencoded({ extended: true })); // 解析URL编码请求体

// 挂载路由
app.use('/api/v1', routes);

// 全局中间件：404 + 错误处理
app.use(notFoundHandler);
app.use(errorHandler);

// 启动服务器
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`Server running in ${config.nodeEnv} mode on http://localhost:${PORT}`);
>>>>>>> 4d9c73e (🐛 修复打包)
});