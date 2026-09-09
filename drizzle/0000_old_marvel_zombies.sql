CREATE TABLE `audits` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`record_id` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_files_record` ON `files` (`record_id`);--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires` text NOT NULL,
	`used_by` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_hash_unique` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`firm` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`area` text DEFAULT 'Raipur' NOT NULL,
	`role` text DEFAULT 'broker' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`broker_id` text NOT NULL,
	`created_at` text NOT NULL,
	`verified_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_email_unique` ON `members` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `members_broker_id_unique` ON `members` (`broker_id`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`owner_id` text NOT NULL,
	`partner_id` text,
	`status` text NOT NULL,
	`unique_key` text,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `records_unique_key_unique` ON `records` (`unique_key`);--> statement-breakpoint
CREATE INDEX `idx_records_kind_owner` ON `records` (`kind`,`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_records_partner` ON `records` (`partner_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
