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

 Date: 12/12/2025 22:26:01
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

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
  `category_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `category_amount` decimal(16,2) NOT NULL COMMENT '该分类分配的预算金额（仅支出，保留2位小数）',
  `category_actual_amount` decimal(16,2) DEFAULT '0.00' COMMENT '该分类实际支出金额',
  `remaining_percent` decimal(5,2) NOT NULL DEFAULT '100.00' COMMENT '剩余预算百分比',
  `is_active` tinyint(1) DEFAULT '1' COMMENT '是否启用：0-禁用 1-启用',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `sort_order` tinyint DEFAULT '99' COMMENT '分类名',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mate_budget_category` (`budget_id`,`category_id`),
  KEY `idx_user_book` (`user_id`,`book_id`) COMMENT '用户+账本索引（优化数据隔离查询）',
  KEY `idx_budget_id` (`budget_id`) COMMENT '预算ID索引（按预算查关联分类）',
  KEY `idx_category_id` (`category_id`) COMMENT '分类ID索引（按分类查关联预算）',
  CONSTRAINT `fk_mate_category_budget_budget` FOREIGN KEY (`budget_id`) REFERENCES `mate_budget` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_mate_category_budget_category` FOREIGN KEY (`category_id`) REFERENCES `mate_category` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_mate_category_actual_amount` CHECK ((`category_actual_amount` >= 0)),
  CONSTRAINT `chk_mate_category_amount` CHECK ((`category_amount` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=78 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='分类预算关联表（预算-分类多对多关联）';

-- ----------------------------
-- Records of mate_budget_category
-- ----------------------------
BEGIN;
INSERT INTO `mate_budget_category` VALUES (62, 1, 1, 16, 1, '餐饮', 300.00, 1392.98, 100.00, 1, '2025-12-12 22:19:10', '2025-12-12 22:25:40', 99);
INSERT INTO `mate_budget_category` VALUES (63, 1, 1, 16, 2, '购物', 500.00, 58.00, 100.00, 1, '2025-12-12 22:19:10', '2025-12-12 22:25:40', 99);
COMMIT;

SET FOREIGN_KEY_CHECKS = 1;
