import express from "express"; // 导入值（express 是函数/对象）
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
// @ts-ignore
import routes from "./routes/index.ts";
// 测试代码
// 显式指定 app 类型为 Application
const app = express();
// 中间件
app.use(cors());
app.use(express.json());
app.use('/api/v1', routes);
const PORT = process.env.PORT || 9876;
app.listen(PORT, () => {
    console.log(`✅✅✅ 服务器已启动：http://localhost:${PORT} ✅✅✅`);
});
