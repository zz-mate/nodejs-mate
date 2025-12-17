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

 Date: 12/12/2025 11:09:39
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for mate_account
-- ----------------------------
DROP TABLE IF EXISTS `mate_account`;
CREATE TABLE `mate_account` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '账户ID（主键）',
  `user_id` bigint unsigned DEFAULT NULL COMMENT '用户ID（关联用户表，NULL表示系统公共账户）',
  `parent_account_id` bigint unsigned DEFAULT NULL COMMENT '账户分类父ID',
  `account_id` bigint unsigned DEFAULT NULL COMMENT '父账户ID（0表示顶级账户，支持层级结构）',
  `name` varchar(50) NOT NULL COMMENT '账户名称（如：现金、微信钱包、北京银行信用卡）',
  `type` tinyint unsigned NOT NULL DEFAULT '1' COMMENT '账户类型：1-现金 2-银行卡(储蓄卡) 3-银行卡(信用卡) 4-虚拟账户(支付宝/微信) 5-投资账户 6-储值卡',
  `icon` varchar(100) DEFAULT '' COMMENT '账户图标（存储图标路径/标识，如：?、?）',
  `color` varchar(20) DEFAULT '#333333' COMMENT '账户展示颜色（十六进制值）',
  `sort_order` int unsigned DEFAULT '0' COMMENT '排序序号（数字越小越靠前）',
  `is_system` tinyint(1) DEFAULT '0' COMMENT '是否系统内置账户：0-否 1-是',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '是否启用：0-禁用 1-启用',
  `balance` decimal(16,2) DEFAULT '0.00' COMMENT '账户余额（虚拟/银行卡账户实时余额）',
  `card_no` varchar(50) DEFAULT '' COMMENT '银行卡号/虚拟账户标识（脱敏存储，如：6226****1234）',
  `bank_name` varchar(50) DEFAULT '' COMMENT '开户行名称（仅银行卡类型必填）',
  `remark` varchar(200) DEFAULT '' COMMENT '账户备注（如：信用卡额度、开户行等）',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_type` (`type`) COMMENT '账户类型索引（优化按类型筛选）',
  KEY `idx_sort_order` (`sort_order`) COMMENT '排序索引',
  KEY `idx_is_active` (`is_active`) COMMENT '启用状态索引',
  CONSTRAINT `chk_account_type` CHECK ((`type` in (1,2,3,4,5,6)))
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='账本账户表（含类型区分）';

-- ----------------------------
-- Records of mate_account
-- ----------------------------
BEGIN;
INSERT INTO `mate_account` VALUES (1, 1, 4, 9, '支付宝自定义', 1, '', '#333333', 0, 0, 1, 0.00, '', '', '', '2025-12-12 11:07:30', '2025-12-12 11:09:15');
COMMIT;

SET FOREIGN_KEY_CHECKS = 1;
