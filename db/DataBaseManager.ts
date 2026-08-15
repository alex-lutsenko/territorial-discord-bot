import Database from "better-sqlite3";
import {Snowflake} from "discord.js";
import * as settings from "../BotSettingProvider.js";

const db = new Database("./ranking.db");
db.pragma("journal_mode = WAL");

db.prepare("CREATE TABLE IF NOT EXISTS global_points (guild TEXT, member TEXT, points INTEGER, wins INTEGER, PRIMARY KEY (guild, member))").run();
db.prepare("CREATE TABLE IF NOT EXISTS daily_points (guild TEXT, member TEXT, day INTEGER, points INTEGER, wins INTEGER, PRIMARY KEY (guild, member, day))").run();

export function getProvider(): Database.Database {
	return db;
}

export function getSettingProvider() {
	return settings;
}

export function deleteGuild(id: Snowflake) {
	db.prepare("DELETE FROM global_points WHERE guild = ?").run(id);
	db.prepare("DELETE FROM daily_points WHERE guild = ?").run(id);
}