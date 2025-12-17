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

 Date: 12/12/2025 11:10:17
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for mate_account_category
-- ----------------------------
DROP TABLE IF EXISTS `mate_account_category`;
CREATE TABLE `mate_account_category` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '账户ID（主键）',
  `user_id` bigint unsigned DEFAULT NULL COMMENT '用户ID（关联用户表）',
  `parent_id` bigint unsigned DEFAULT '0' COMMENT '父账户ID（0表示顶级账户）',
  `name` varchar(50) NOT NULL COMMENT '账户名称（如：微信钱包、银行卡、支付宝）',
  `icon` varchar(100) DEFAULT '' COMMENT '账户图标（存储图标路径/标识）',
  `color` varchar(20) DEFAULT '#333333' COMMENT '账户颜色（十六进制值）',
  `type` tinyint NOT NULL,
  `sort_order` int unsigned DEFAULT '0' COMMENT '排序序号（数字越小越靠前）',
  `is_system` tinyint(1) DEFAULT '0' COMMENT '是否系统内置账户：0-否 1-是',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '是否启用：0-禁用 1-启用',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '账户类型',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='账本账户表';

-- ----------------------------
-- Records of mate_account_category
-- ----------------------------
BEGIN;
INSERT INTO `mate_account_category` VALUES (1, NULL, 0, '现金', '', '#333333', 1, 0, 0, 1, '2025-12-12 10:21:47', '2025-12-12 10:59:58');
INSERT INTO `mate_account_category` VALUES (2, NULL, 0, '信用卡', '', '#333333', 2, 0, 0, 1, '2025-12-12 10:23:19', '2025-12-12 11:00:00');
INSERT INTO `mate_account_category` VALUES (3, NULL, 0, '储蓄卡/借记卡', '', '#333333', 2, 0, 0, 1, '2025-12-12 10:23:34', '2025-12-12 11:00:01');
INSERT INTO `mate_account_category` VALUES (4, NULL, 0, '网络账户', '', '#333333', 1, 0, 0, 1, '2025-12-12 10:23:50', '2025-12-12 11:00:06');
INSERT INTO `mate_account_category` VALUES (5, NULL, 0, '投资账户', '', '#333333', 2, 0, 0, 1, '2025-12-12 10:23:59', '2025-12-12 11:00:08');
INSERT INTO `mate_account_category` VALUES (6, NULL, 0, '储值卡', '', '#333333', 2, 0, 0, 1, '2025-12-12 10:24:11', '2025-12-12 11:00:08');
INSERT INTO `mate_account_category` VALUES (7, NULL, 2, '北京银行', '', '#333333', 2, 0, 0, 1, '2025-12-12 10:24:39', '2025-12-12 11:00:09');
INSERT INTO `mate_account_category` VALUES (8, NULL, 3, '北京银行', '', '#333333', 2, 0, 0, 1, '2025-12-12 10:25:04', '2025-12-12 11:00:11');
INSERT INTO `mate_account_category` VALUES (9, NULL, 4, '支付宝', '', '#333333', 1, 0, 0, 1, '2025-12-12 10:25:17', '2025-12-12 11:00:11');
COMMIT;

SET FOREIGN_KEY_CHECKS = 1;
