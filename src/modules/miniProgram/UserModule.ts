<<<<<<< HEAD
import pool from '../../db/index.ts';
import type {UserDbSchema} from "../../types";
import {maskPhoneNumber} from "../../utils/tools.ts"
=======
import pool from '../../db';
import type {UserDbSchema} from "../../types";
import {maskPhoneNumber} from "../../utils/tools"
>>>>>>> 4d9c73e (🐛 修复打包)

class UserModule {
    userTableName = 'mate_user';

    async findById(user_id: number) :Promise<UserDbSchema | null> {
        const [rows] = await pool.execute(
            `SELECT id
             FROM ${this.userTableName}
             WHERE id = ? LIMIT 1`,
            [user_id]
        );
        const user = (rows as UserDbSchema[])[0];
        return user || null;
    }
    async info(user_id: number) :Promise<UserDbSchema | null> {
        const [rows] = await pool.execute(
            `SELECT id,uuid,username,email,phone,nickname,avatar,gender,birthday,default_book_id,is_active,created_at,updated_at
             FROM ${this.userTableName}
             WHERE id = ? LIMIT 1`,
            [user_id]
        );
        const user = (rows as UserDbSchema[])[0];
        if (!user) return null;

        // 性别数值映射为文本
        let genderText: string;
        switch (user.gender) {
            case 1:
                genderText = '男';
                break;
            case 2:
                genderText = '女';
                break;
            default: // 0或其他值都视为未知
                genderText = '未知';
        }

        // 组装含性别文本的用户信息
        // @ts-ignore
        return {
            ...user,
            phone:maskPhoneNumber(typeof user.phone === "string" ? user.phone :''),
            gender_text: genderText
        };
    }

}

export default new UserModule();