# nodejs-mate
ALTER TABLE `mate_category` 
ADD COLUMN `is_deleted` tinyint(1) DEFAULT '0' COMMENT '是否删除：0-未删除 1-已删除' AFTER `is_active`,
-- 新增删除时间，便于溯源
ADD COLUMN `deleted_at` datetime DEFAULT NULL COMMENT '删除时间' AFTER `is_deleted`;

-- 优化索引：查询时默认过滤已删除数据
CREATE INDEX `idx_user_book_deleted` ON `mate_category`(`user_id`, `book_id`, `is_deleted`);


-- 用户-分类删除关联表（记录用户主动删除的分类）
CREATE TABLE `mate_category_user_delete` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `user_id` bigint unsigned NOT NULL COMMENT '用户ID',
  `category_id` bigint unsigned NOT NULL COMMENT '分类ID',
  `deleted_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_category` (`user_id`,`category_id`) COMMENT '用户+分类 唯一（避免重复标记）',
  KEY `idx_category_id` (`category_id`) COMMENT '分类ID索引'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户删除分类关联表';

-- 为预算分类表添加逻辑删除字段
ALTER TABLE mate_budget_category
ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标识：0=未删除，1=已删除'
AFTER is_active;

-- 可选：添加索引优化查询
CREATE INDEX idx_budget_category_is_deleted ON mate_budget_category(is_deleted);
CREATE INDEX idx_budget_category_user_deleted ON mate_budget_category(user_id, is_deleted);