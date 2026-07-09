-- Pterodactyl Dashboard - Database Schema

CREATE DATABASE IF NOT EXISTS `ptero_dashboard` CHARACTER SET utf8mb4;
USE `ptero_dashboard`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(50) UNIQUE NOT NULL,
  `email` VARCHAR(100) UNIQUE NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `discord_id` VARCHAR(50) NOT NULL,
  `coins` INT DEFAULT 0,
  `is_admin` TINYINT(1) DEFAULT 0,
  `ptero_user_id` INT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `plans` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `price` INT NOT NULL,
  `ram` INT NOT NULL,
  `cpu` INT NOT NULL,
  `disk` INT NOT NULL,
  `allocations` INT NOT NULL DEFAULT 1,
  `backups` INT NOT NULL DEFAULT 0,
  `duration_days` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `redeem_codes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `coins` INT NOT NULL,
  `max_claims` INT NOT NULL,
  `claims_used` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `redeem_claims` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `redeem_code_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `claimed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_claim` (`redeem_code_id`, `user_id`),
  FOREIGN KEY (`redeem_code_id`) REFERENCES `redeem_codes`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `servers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `plan_id` INT NOT NULL,
  `ptero_server_id` INT NOT NULL,
  `ptero_identifier` VARCHAR(20),
  `name` VARCHAR(100),
  `expires_at` TIMESTAMP NOT NULL,
  `notified` TINYINT(1) DEFAULT 0,
  `status` VARCHAR(20) DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`)
);

CREATE TABLE IF NOT EXISTS `settings` (
  `id` INT PRIMARY KEY DEFAULT 1,
  `panel_url` VARCHAR(255) DEFAULT '',
  `panel_api_key` VARCHAR(255) DEFAULT '',
  `panel_name` VARCHAR(100) DEFAULT 'Pterodactyl Dashboard',
  `theme_color` VARCHAR(20) DEFAULT '#7c3aed',
  `background_url` VARCHAR(255) DEFAULT NULL,
  `default_location_id` INT DEFAULT 1,
  `default_nest_id` INT DEFAULT 1,
  `default_egg_id` INT DEFAULT 1
);

INSERT INTO `settings` (`id`) VALUES (1) ON DUPLICATE KEY UPDATE `id`=`id`;
