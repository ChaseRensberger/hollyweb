CREATE TABLE `movie_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movie_id` text NOT NULL,
	`data` text NOT NULL,
	`imported_at` integer NOT NULL,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE no action
);
