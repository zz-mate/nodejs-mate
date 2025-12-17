/*
 Navicat Premium Data Transfer

 Source Server         : local_dev_db
 Source Server Type    : MySQL
 Source Server Version : 80044
 Source Host           : localhost:3306
 Source Schema         : local_mate_db

 Target Server Type    : MySQL
 Target Server Version : 80044
 File Encoding         : 65001

 Date: 11/12/2025 12:51:03
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for mate_account
-- ----------------------------
DROP TABLE IF EXISTS `mate_account`;
CREATE TABLE `mate_account` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '账户ID（主键）',
  `user_id` bigint unsigned NOT NULL COMMENT '用户ID（关联用户表）',
  `book_id` bigint unsigned NOT NULL COMMENT '账本ID（关联账本表）',
  `parent_id` bigint unsigned DEFAULT '0' COMMENT '父账户ID（0表示顶级账户）',
  `name` varchar(50) NOT NULL COMMENT '账户名称（如：微信钱包、银行卡、支付宝）',
  `type` tinyint unsigned NOT NULL COMMENT '账户类型：1-收入类账户，2-支出类账户，3-转账类账户',
  `icon` varchar(100) DEFAULT '' COMMENT '账户图标（存储图标路径/标识）',
  `color` varchar(20) DEFAULT '#333333' COMMENT '账户颜色（十六进制值）',
  `sort_order` int unsigned DEFAULT '0' COMMENT '排序序号（数字越小越靠前）',
  `is_system` tinyint(1) DEFAULT '0' COMMENT '是否系统内置账户：0-否 1-是',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '是否启用：0-禁用 1-启用',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_book` (`user_id`,`book_id`) COMMENT '用户+账本索引（优化按用户+账本查询账户）',
  KEY `idx_parent_id` (`parent_id`) COMMENT '父账户索引（优化层级查询）',
  KEY `idx_type` (`type`) COMMENT '账户类型索引（优化收支/转账类账户筛选）',
  KEY `idx_sort_order` (`sort_order`) COMMENT '排序索引',
  CONSTRAINT `chk_mate_account_type` CHECK ((`type` in (1,2,3)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='账本账户表';

-- ----------------------------
-- Table structure for mate_bill
-- ----------------------------
DROP TABLE IF EXISTS `mate_bill`;
CREATE TABLE `mate_bill` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '账单主键ID',
  `uuid` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '账单唯一标识（UUID）',
  `user_id` bigint unsigned NOT NULL COMMENT '关联用户ID',
  `book_id` bigint unsigned DEFAULT NULL COMMENT '关联账本ID（多账本场景）',
  `account_id` bigint unsigned DEFAULT NULL COMMENT '关联账户ID（关联账户表）',
  `amount` decimal(12,2) NOT NULL COMMENT '账单金额（正数收入，负数支出）',
  `type` tinyint NOT NULL COMMENT '收支类型：1-收入，2-支出',
  `category_id` bigint unsigned NOT NULL COMMENT '账单分类ID（关联分类表）',
  `tags` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '标签，多个用逗号分隔',
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CNY' COMMENT '币种（默认人民币）',
  `bill_time` datetime NOT NULL COMMENT '账单发生时间',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '账单备注',
  `is_deleted` tinyint NOT NULL DEFAULT '0' COMMENT '是否删除：0-未删，1-已删',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_uuid` (`uuid`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_book_id` (`book_id`),
  KEY `idx_bill_time` (`bill_time`),
  KEY `idx_category_id` (`category_id`),
  KEY `idx_account_id` (`account_id`)
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账单表';

-- ----------------------------
-- Table structure for mate_book
-- ----------------------------
DROP TABLE IF EXISTS `mate_book`;
CREATE TABLE `mate_book` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '账本自增ID',
  `uuid` char(36) NOT NULL COMMENT '账本UUID（对外暴露）',
  `user_id` bigint unsigned NOT NULL COMMENT '所属用户ID（暂不关联数据库）',
  `name` varchar(50) NOT NULL COMMENT '账本名称',
  `type` tinyint DEFAULT '1' COMMENT '账本类型：1个人 2家庭 3企业',
  `currency` varchar(10) DEFAULT 'CNY' COMMENT '记账币种（CNY/USD/EUR等）',
  `description` varchar(255) DEFAULT '' COMMENT '账本描述',
  `is_default` tinyint DEFAULT '0' COMMENT '是否用户默认账本：1是 0否',
  `is_active` tinyint DEFAULT '1' COMMENT '状态：1正常 0禁用',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_book_uuid` (`uuid`),
  KEY `idx_book_user_id` (`user_id`),
  KEY `idx_book_is_default` (`is_default`),
  CONSTRAINT `fk_book_user` FOREIGN KEY (`user_id`) REFERENCES `mate_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='账本表';

-- ----------------------------
-- Table structure for mate_budget
-- ----------------------------
DROP TABLE IF EXISTS `mate_budget`;
CREATE TABLE `mate_budget` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '预算ID（主键）',
  `user_id` bigint unsigned NOT NULL COMMENT '用户ID（关联用户表）',
  `book_id` bigint unsigned NOT NULL COMMENT '账本ID（关联账本表）',
  `amount` decimal(16,2) NOT NULL COMMENT '预算金额（仅支出预算，保留2位小数）',
  `actual_amount` decimal(16,2) DEFAULT '0.00' COMMENT '实际支出金额（仅统计支出类金额，收入/转账不计入）',
  `remaining_percent` decimal(5,2) GENERATED ALWAYS AS (if((`amount` = 0),0,round((((`amount` - `actual_amount`) / `amount`) * 100),2))) STORED COMMENT '剩余预算百分比（自动计算：(预算-实际)/预算*100，保留2位小数）',
  `cycle_type` varchar(20) NOT NULL COMMENT '预算周期类型（day-按天，week-按周，month-按月，year-按年，custom-自定义）',
  `cycle_start` date NOT NULL COMMENT '周期开始日期',
  `cycle_end` date NOT NULL COMMENT '周期结束日期',
  `sort_order` int unsigned DEFAULT '0' COMMENT '排序序号（数字越小越靠前）',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '是否启用：0-禁用 1-启用',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_book` (`user_id`,`book_id`) COMMENT '用户+账本索引（优化按账本查询预算）',
  KEY `idx_cycle_date` (`cycle_start`,`cycle_end`) COMMENT '周期日期索引（优化按时间筛选预算）',
  KEY `idx_cycle_type` (`cycle_type`) COMMENT '周期类型索引（优化按周期筛选预算）',
  KEY `idx_sort_order` (`sort_order`) COMMENT '排序索引',
  CONSTRAINT `chk_actual_not_exceed_amount` CHECK ((`actual_amount` <= `amount`)),
  CONSTRAINT `chk_budget_actual_amount` CHECK ((`actual_amount` >= 0)),
  CONSTRAINT `chk_budget_amount` CHECK ((`amount` >= 0)),
  CONSTRAINT `chk_budget_cycle_type` CHECK ((`cycle_type` in (_utf8mb4'day',_utf8mb4'week',_utf8mb4'month',_utf8mb4'year',_utf8mb4'custom')))
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='账本支出预算表';

-- ----------------------------
-- Table structure for mate_budget_category
-- ----------------------------
DROP TABLE IF EXISTS `mate_budget_category`;
CREATE TABLE `mate_budget_category` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '分类预算关联ID（主键）',
  `user_id` bigint unsigned NOT NULL COMMENT '用户ID（关联用户表，做数据隔离）',
  `book_id` bigint unsigned NOT NULL COMMENT '账本ID（关联账本表）',
  `budget_id` bigint unsigned NOT NULL COMMENT '预算ID（关联mate_budget表）',
  `category_id` bigint unsigned NOT NULL COMMENT '分类ID（关联mate_category表）',
  `category_amount` decimal(16,2) NOT NULL COMMENT '该分类分配的预算金额（仅支出，保留2位小数）',
  `category_actual_amount` decimal(16,2) DEFAULT '0.00' COMMENT '该分类实际支出金额',
  `remaining_percent` decimal(5,2) GENERATED ALWAYS AS (if((`category_amount` = 0),0,round((((`category_amount` - `category_actual_amount`) / `category_amount`) * 100),2))) STORED COMMENT '该分类剩余预算百分比（自动计算）',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '是否启用：0-禁用 1-启用',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `sort_order` tinyint DEFAULT '99',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mate_budget_category` (`budget_id`,`category_id`),
  KEY `idx_user_book` (`user_id`,`book_id`) COMMENT '用户+账本索引（优化数据隔离查询）',
  KEY `idx_budget_id` (`budget_id`) COMMENT '预算ID索引（按预算查关联分类）',
  KEY `idx_category_id` (`category_id`) COMMENT '分类ID索引（按分类查关联预算）',
  CONSTRAINT `fk_mate_category_budget_budget` FOREIGN KEY (`budget_id`) REFERENCES `mate_budget` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_mate_category_budget_category` FOREIGN KEY (`category_id`) REFERENCES `mate_category` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_mate_category_actual_amount` CHECK ((`category_actual_amount` >= 0)),
  CONSTRAINT `chk_mate_category_amount` CHECK ((`category_amount` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='分类预算关联表（预算-分类多对多关联）';

-- ----------------------------
-- Table structure for mate_category
-- ----------------------------
DROP TABLE IF EXISTS `mate_category`;
CREATE TABLE `mate_category` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '分类ID（主键）',
  `user_id` bigint unsigned DEFAULT NULL COMMENT '用户ID（关联用户表）',
  `book_id` bigint unsigned DEFAULT NULL COMMENT '账本ID（关联账本表）',
  `parent_id` bigint unsigned DEFAULT '0' COMMENT '父分类ID（0表示顶级分类）',
  `name` varchar(50) NOT NULL COMMENT '分类名称',
  `type` tinyint unsigned NOT NULL COMMENT '分类类型：1-收入，2-支出，3-转账',
  `icon` varchar(100) DEFAULT '' COMMENT '分类图标（存储图标路径/标识）',
  `color` varchar(20) DEFAULT '#333333' COMMENT '分类颜色（十六进制值）',
  `sort_order` int unsigned DEFAULT '0' COMMENT '排序序号（数字越小越靠前）',
  `is_system` tinyint(1) DEFAULT '0' COMMENT '是否系统内置分类：0-否 1-是',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '是否启用：0-禁用 1-启用',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_book` (`user_id`,`book_id`) COMMENT '用户+账本索引（优化按用户+账本查询分类）',
  KEY `idx_parent_id` (`parent_id`) COMMENT '父分类索引（优化层级查询）',
  KEY `idx_type` (`type`) COMMENT '分类类型索引（优化收支/转账筛选）',
  KEY `idx_sort_order` (`sort_order`) COMMENT '排序索引',
  CONSTRAINT `chk_category_type` CHECK ((`type` in (1,2,3)))
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='账本收支分类表';

-- ----------------------------
-- Table structure for mate_user
-- ----------------------------
DROP TABLE IF EXISTS `mate_user`;
CREATE TABLE `mate_user` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '用户自增ID（内部使用）',
  `uuid` char(36) NOT NULL COMMENT '用户唯一UUID（对外暴露）',
  `username` varchar(50) NOT NULL COMMENT '用户名',
  `email` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '邮箱',
  `phone` varchar(20) DEFAULT NULL COMMENT '手机号',
  `password` varchar(255) NOT NULL COMMENT '加密密码',
  `nickname` varchar(50) DEFAULT '' COMMENT '昵称',
  `avatar` varchar(255) DEFAULT '' COMMENT '头像URL',
  `gender` tinyint DEFAULT '0' COMMENT '性别：0未知 1男 2女',
  `birthday` date DEFAULT NULL COMMENT '生日',
  `default_book_id` bigint unsigned DEFAULT NULL COMMENT '用户默认账本ID',
  `is_active` tinyint DEFAULT '1' COMMENT '状态：1正常 0禁用 2注销',
  `role` varchar(20) DEFAULT 'user' COMMENT '角色：admin/user/vip',
  `last_login_at` datetime DEFAULT NULL COMMENT '最后登录时间',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_uuid` (`uuid`),
  UNIQUE KEY `uk_username` (`username`),
  UNIQUE KEY `uk_email` (`email`),
  UNIQUE KEY `uk_phone` (`phone`),
  KEY `idx_default_book_id` (`default_book_id`),
  CONSTRAINT `fk_user_default_book` FOREIGN KEY (`default_book_id`) REFERENCES `mate_book` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户表';

SET FOREIGN_KEY_CHECKS = 1;
