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

 Date: 12/12/2025 09:22:32
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='账本收支分类表';

SET FOREIGN_KEY_CHECKS = 1;
