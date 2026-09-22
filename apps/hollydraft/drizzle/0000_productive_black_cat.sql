CREATE TABLE `drafts` (
	`league_id` text PRIMARY KEY NOT NULL,
	`order` text NOT NULL,
	`pool` text NOT NULL,
	`next_pick` integer DEFAULT 1 NOT NULL,
	`deadline` integer,
	`paused` integer DEFAULT false NOT NULL,
	`remaining` integer NOT NULL,
	`pause_reason` text,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`league_id` text NOT NULL,
	`type` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `league_events` ON `events` (`league_id`,`id`);--> statement-breakpoint
CREATE TABLE `gross_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movie_id` text NOT NULL,
	`amount` integer NOT NULL,
	`through` text NOT NULL,
	`observed_at` integer NOT NULL,
	`source` text NOT NULL,
	`reason` text,
	`hash` text NOT NULL,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gross_reports_hash_unique` ON `gross_reports` (`hash`);--> statement-breakpoint
CREATE INDEX `gross_movie_date` ON `gross_reports` (`movie_id`,`through`);--> statement-breakpoint
CREATE TABLE `imports` (
	`hash` text PRIMARY KEY NOT NULL,
	`imported_at` integer NOT NULL,
	`summary` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`hash` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `leagues` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`commissioner_id` text NOT NULL,
	`season` integer NOT NULL,
	`capacity` integer NOT NULL,
	`slots` integer NOT NULL,
	`pick_seconds` integer NOT NULL,
	`state` text DEFAULT 'lobby' NOT NULL,
	`created_at` integer NOT NULL,
	`final_scores` text
);
--> statement-breakpoint
CREATE TABLE `login_flows` (
	`hash` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`verifier` text NOT NULL,
	`return_to` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `movies` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`studio` text NOT NULL,
	`season` integer NOT NULL,
	`rank` integer NOT NULL,
	`release_date` text,
	`release_status` text NOT NULL,
	`source` text NOT NULL,
	`researched_at` integer NOT NULL,
	`poster` text,
	`imdb_id` text,
	`wikidata_id` text,
	`locked_at` integer
);
--> statement-breakpoint
CREATE TABLE `picks` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`team_id` text NOT NULL,
	`movie_id` text NOT NULL,
	`overall` integer NOT NULL,
	`automatic` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pick_number` ON `picks` (`league_id`,`overall`);--> statement-breakpoint
CREATE UNIQUE INDEX `pick_movie` ON `picks` (`league_id`,`movie_id`);--> statement-breakpoint
CREATE TABLE `queues` (
	`team_id` text PRIMARY KEY NOT NULL,
	`movies` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rosters` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`team_id` text NOT NULL,
	`movie_id` text NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roster_movie` ON `rosters` (`league_id`,`movie_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`access` text NOT NULL,
	`refresh` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_membership` ON `teams` (`league_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `trades` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`give` text NOT NULL,
	`receive` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
