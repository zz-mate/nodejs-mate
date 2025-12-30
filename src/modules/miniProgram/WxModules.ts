import { WXAPI } from "../../api/weixin";
import axios from "axios";
import pool from "../../db";
import type { UserDbSchema } from "@/types";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import HttpError from "../../utils/HttpError";
import { generateToken } from "../../utils/tokenUtils";
import pointModule from "./PointModule";
import userModule from "./UserModule";
import UsernameGenerator from "../../tools/usernameGenerator";

console.log(WXAPI); // https://api.weixin.qq.com

class WxModule {
  userTableName = "mate_user";
  bookTableName = "mate_book";
  userProfileTableName = "mate_user_profile";

  formatSafeUser(user: UserDbSchema): UserDbSchema {
    const { password, ...safeData } = user;
    return safeData as UserDbSchema;
  }

  async jscode2session(code: string) {
    if (!code) {
      throw new Error("code 不能为空");
    }

    try {
      const url = `${WXAPI}/sns/jscode2session`;
      const response = await axios.get(url, {
        params: {
          appid: process.env.WX_APPID,
          secret: process.env.WX_APPSECRET,
          js_code: code,
          grant_type: "authorization_code",
        },
        timeout: 10000,
      });

      const result = response.data;
      if (result.errcode && result.errcode !== 0) {
        throw new Error(`微信接口错误: ${result.errmsg} (${result.errcode})`);
      }

      const [rows] = await pool.execute(
        `SELECT id, openid, nickname, avatar, gender FROM ${this.userTableName} WHERE openid = ? LIMIT 1`,
        [result.openid]
      );

      const user = (rows as UserDbSchema[])[0];
      return {
        ...result,
        existUser: user ? true : false,
        userId: user?.id,
      };
    } catch (error) {
      console.error("jscode2session 请求失败:", error);
      throw error;
    }
  }

  async saveUser(openid: string): Promise<any> {
    if (!openid) {
      throw new HttpError("openid不能为空", 400);
    }

    let connection: any = null;
    try {
      connection = await pool.getConnection();
      // 1. 优化1：设置事务超时时间（缩短等待时间）
      await connection.execute("SET innodb_lock_wait_timeout = 10");
      await connection.beginTransaction();

      // 查询用户是否存在
      const [existUserRows] = await connection.execute(
        `SELECT id, openid FROM ${this.userTableName} WHERE openid = ? LIMIT 1`,
        [openid]
      );
      const existUser = (existUserRows as UserDbSchema[])[0];
      let userId: number, token: string;

      if (existUser) {
        // 更新已有用户信息
        userId = existUser.id as any;
        await connection.execute(
          `UPDATE ${this.userTableName}
                     SET updated_at = ?
                     WHERE openid = ?`,
          [new Date(), openid]
        );

        const [updatedUserRows] = await connection.execute(
          `SELECT * FROM ${this.userTableName} WHERE id = ? LIMIT 1`,
          [userId]
        );
        const updatedUser = (updatedUserRows as UserDbSchema[])[0];
        const safeUser = this.formatSafeUser(updatedUser);
        token = generateToken(safeUser);
      } else {
        // 创建新用户
        const defaultPassword = await bcrypt.hash(openid.slice(-6), 10);
        const defaultUserData = {
          username: `wx_${openid.slice(-8)}`,
          uuid: uuidv4(),
          phone: null,
          openid: openid,
          email: null,
          password: defaultPassword,
          nickname: UsernameGenerator.finance(),
          birthday: null,
          is_active: 1,
          role: "user",
          last_login_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
          default_book_id: null,
        };

        // 插入用户表
        const [userResult] = await connection.execute(
          `INSERT INTO ${this.userTableName}
                     (username, uuid, phone, openid, email, password, nickname, birthday, is_active, role,
                      last_login_at, created_at, updated_at, deleted_at, default_book_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            defaultUserData.username,
            defaultUserData.uuid,
            defaultUserData.phone,
            defaultUserData.openid,
            defaultUserData.email,
            defaultUserData.password,
            defaultUserData.nickname,
            defaultUserData.birthday,
            defaultUserData.is_active,
            defaultUserData.role,
            defaultUserData.last_login_at,
            defaultUserData.created_at,
            defaultUserData.updated_at,
            defaultUserData.deleted_at,
            defaultUserData.default_book_id,
          ]
        );
        userId = (userResult as any).insertId;

        // 插入默认账本
        const defaultBookData = {
          uuid: uuidv4(),
          user_id: userId,
          name: "日常账本",
          book_category_id: 1,
          type: 1,
          currency: "CNY",
          description: "",
          is_default: 1,
          is_active: 1,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        };
        const [bookResult] = await connection.execute(
          `INSERT INTO ${this.bookTableName}
                     (uuid, user_id, name, book_category_id, type, currency, description, is_default, is_active, created_at, updated_at,
                      deleted_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            defaultBookData.uuid,
            defaultBookData.user_id,
            defaultBookData.name,
            defaultBookData.book_category_id,
            defaultBookData.type,
            defaultBookData.currency,
            defaultBookData.description,
            defaultBookData.is_default,
            defaultBookData.is_active,
            defaultBookData.created_at,
            defaultBookData.updated_at,
            defaultBookData.deleted_at,
          ]
        );
        const bookId = (bookResult as any).insertId;

        // 更新用户默认账本ID
        await connection.execute(
          `UPDATE ${this.userTableName} SET default_book_id = ? WHERE id = ?`,
          [bookId, userId]
        );

        // 插入用户信息表
        const defaultProfileData = {
          user_id: userId,
          level: 1,
          level_exp: 0,
          register_time: new Date(),
          last_login_time: new Date(),
          total_used_days: 0,
          continuous_used_days: 0,
          total_bill_count: 0,
          month_bill_count: 0,
          total_income: 0.0,
          total_expense: 0.0,
          total_book_count: 1,
          favorite_category_ids: "",
          is_vip: 0,
          vip_expire_time: null,
          remark: "微信注册用户",
          created_at: new Date(),
          updated_at: new Date(),
          is_deleted: 0,
        };
        await connection.execute(
          `INSERT INTO ${this.userProfileTableName}
                     (user_id, level, level_exp, register_time, last_login_time, total_used_days, continuous_used_days,
                      total_bill_count, month_bill_count, total_income, total_expense, total_book_count,
                      favorite_category_ids, is_vip, vip_expire_time, remark, created_at, updated_at, is_deleted)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            defaultProfileData.user_id,
            defaultProfileData.level,
            defaultProfileData.level_exp,
            defaultProfileData.register_time,
            defaultProfileData.last_login_time,
            defaultProfileData.total_used_days,
            defaultProfileData.continuous_used_days,
            defaultProfileData.total_bill_count,
            defaultProfileData.month_bill_count,
            defaultProfileData.total_income,
            defaultProfileData.total_expense,
            defaultProfileData.total_book_count,
            defaultProfileData.favorite_category_ids,
            defaultProfileData.is_vip,
            defaultProfileData.vip_expire_time,
            defaultProfileData.remark,
            defaultProfileData.created_at,
            defaultProfileData.updated_at,
            defaultProfileData.is_deleted,
          ]
        );

        // 生成Token
        const newUser: any = {
          ...defaultUserData,
          id: userId,
          default_book_id: bookId,
        };
        const safeUser = this.formatSafeUser(newUser);
        token = generateToken(safeUser);
      }

      // 提交事务（核心：先提交，再处理积分/经验，避免事务持有锁）
      await connection.commit();

      // 2. 优化2：积分/经验奖励移出事务，异步执行（非核心操作）
      if (!existUser) {
        // 使用 try/catch 包裹，避免奖励失败影响主流程
        try {
          await pointModule.addPoints(
            userId,
            10,
            "activity_new_wx_user",
            "微信新用户注册奖励积分",
            userId
          );
          await userModule.updateUserExp(userId, 5, "微信新用户注册", userId);
        } catch (rewardErr) {
          console.error(`用户${userId}注册奖励积分/经验失败:`, rewardErr);
          // 可记录日志，后续人工补偿，不影响登录流程
        }
      }

      return {
        code: 0,
        msg: existUser ? "用户信息更新成功" : "微信用户注册成功",
        data: {
          id: userId,
          openid,
          token,
        },
      };
    } catch (error) {
      if (connection) {
        await connection
          .rollback()
          .catch((err: any) => console.error("事务回滚失败：", err));
      }

      const err = error as Error & { code: string };
      console.error("保存微信用户失败：", {
        code: err.code,
        message: err.message,
        stack: err.stack,
        openid,
      });

      // 3. 优化3：锁超时错误重试（最多1次）
      if (err.code === "ER_LOCK_WAIT_TIMEOUT") {
        console.log("锁等待超时，尝试重试一次...");
        // 释放连接后重试
        if (connection) connection.release();
        // 递归重试，避免死循环，只重试1次
        return this.saveUser(openid);
      }

      if (err.code === "ER_DUP_ENTRY") {
        throw new HttpError("openid已关联其他用户", 409);
      } else if (err.code === "ER_NO_REFERENCED_ROW_2") {
        throw new HttpError(
          "账本分类ID不存在或default_book_id外键约束失败",
          400
        );
      } else if (error instanceof HttpError) {
        throw error;
      } else {
        throw new HttpError("微信用户保存失败，请稍后重试", 500);
      }
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
}

export default new WxModule();
