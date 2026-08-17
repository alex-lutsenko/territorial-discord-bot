import * as fs from "fs";
import {Snowflake} from "discord.js";
import {rewards} from "./PointManager.js";
import {subscribe} from "./util/GameDataDistributor.js";

export interface MultiplierSetting { amount: number, end: number | null, description: string };
interface Rewards { role_id: string, type: "points" | "wins", count: number };
interface WebHooks { clan: string, url: string, channel: Snowflake };
interface FactorButtons{ name: string, factor: number };

/*
ServerSetting JSON file format that describes the minimum supported settings.json format.
It is slightly different from ServerSetting class e.g. roles: string vs roles: "all" | "highest".
New fields need to be added as optional
*/
interface JSONServerSetting {
	roles: string,
	auto_points: boolean,
	guild_id: string,
	tag: string | null,
	channel_id: Snowflake[],
	log_channel_id: string,
	update_channel_id: string,
	mod_roles: Snowflake[],
	rewards: Rewards[],
	multiplier: MultiplierSetting | null,
	webhooks: { clan: string, url: string, channel: Snowflake }[],
	win_feed: Snowflake | null,
	claim_channel: Snowflake | null,
	claim_channel_description: string | null,
	claim_win_roles?: Snowflake[] | null,
	claim_win_roles_message?: string,
	factor_buttons: { name: string, factor: number }[],
	status: number // first bit: 1 = points imported from 3rd party
}

// Main setting type that is used throughtout the code
export class ServerSetting implements JSONServerSetting
{
	//Specify defaults
	roles: "all" | "highest" = "all";
	auto_points: boolean = false;
	private _guild_id: string = "";  //should always have a value unless a new Guild registration
	tag: string | null = null;
	channel_id: Snowflake[] = [];
	log_channel_id: string = "";
	update_channel_id: string = "";
	mod_roles: Snowflake[] = [];
	rewards: Rewards[] = [];
	private _multiplier: MultiplierSetting | null = null; //implemented as Getter and Setter
	webhooks: WebHooks[] = [];
	win_feed: Snowflake | null = null;
	claim_channel: Snowflake | null = null;
	claim_channel_description: string | null = null; //discord.js rejects "" as description
	claim_win_roles: Snowflake[] = [];
	claim_win_roles_message: string = "🔒 You do not have permission to Claim Wins.";
	factor_buttons: FactorButtons[] = [];
	status: number = 0; // first bit: 1 = points imported from 3rd party

	get guild_id() : string { return this._guild_id; }
	//handles new bot setups
	set guild_id( value: string )
	{
		//add @everyone to claim_win_roles for new setups
		if( this._guild_id === "" && this.claim_win_roles.length === 0 )
				this.claim_win_roles.push(value as Snowflake);
		
		this._guild_id = value;
	}

	get multiplier() : MultiplierSetting | null
	{	
		if (this._multiplier?.end && this._multiplier.end < Date.now())
			this.multiplier = null; //use setter to trigger updateSettings logic

		return this._multiplier;
	}

	set multiplier( value: MultiplierSetting | null )
	{	
		if (value?.end && value.end < Date.now())
			value = null;

		this._multiplier = value;
		updateSettings();
	}

	// Map settings.json to ServerSetting, validate existing data and set defaults for missing properties
	constructor( j: JSONServerSetting | null )
    {
		// Allow initialisation with default values
		if( !j )
			return;

		this.roles = ( j.roles && ( j.roles === "all" || j.roles === "highest" )) ? j.roles : this.roles;
		this.auto_points = j.auto_points ?? this.auto_points;
		//should always have a value for exsting guilds; do not use setter as claim_win_roles is still empty
		this._guild_id = j.guild_id;
		this.tag = j.tag ?? this.tag;
		this.channel_id = j.channel_id ?? this.channel_id;
		this.log_channel_id = j.log_channel_id ?? this.log_channel_id;
		this.update_channel_id = j.update_channel_id ?? this.update_channel_id;
		this.mod_roles = j.mod_roles ?? this.mod_roles;
		this.rewards = j.rewards ?? this.rewards;
		//do not use setter to avoid multiple updateSettings() calls
		this._multiplier = j.multiplier ?? this._multiplier;
		this.webhooks = j.webhooks ?? this.webhooks;
		this.win_feed = j.win_feed ?? this.win_feed;
		this.claim_channel = j.claim_channel ?? this.claim_channel;
		this.claim_channel_description = j.claim_channel_description ?? this.claim_channel_description;
		//existing guilds that do not have claim_win_roles set will get @everyone to preserve existing functionality; DS uses guild_id for @everyone
		this.claim_win_roles = j.claim_win_roles ?? [this.guild_id as Snowflake];
		this.claim_win_roles_message = j.claim_win_roles_message ?? this.claim_win_roles_message;
		this.factor_buttons = j.factor_buttons ?? this.factor_buttons;
		this.status = j.status ?? this.status;
	}

	public static getDefaults = (): ServerSetting => new ServerSetting( null );
	public getDefaults = (): ServerSetting => new ServerSetting( null );

	//JSON.stringify custom handler to properly handle fields with getters
	public toJSON() {
		return {
			roles: this.roles,
			auto_points: this.auto_points,
			guild_id: this._guild_id,
			tag: this.tag,
			channel_id: this.channel_id,
			log_channel_id: this.log_channel_id,
			update_channel_id: this.update_channel_id,
			mod_roles: this.mod_roles,
			rewards: this.rewards,
			multiplier: this._multiplier,
			webhooks: this.webhooks,
			win_feed: this.win_feed,
			claim_channel: this.claim_channel,
			claim_channel_description: this.claim_channel_description,
			claim_win_roles: this.claim_win_roles,
			claim_win_roles_message: this.claim_win_roles_message,
			factor_buttons: this.factor_buttons,
			status: this.status
		}; }
}
import rawSettings from "./settings.json" with { type: "json" };

const indices: { [key: Snowflake]: number } = {};
const clanCache: { [key: string]: Snowflake[] } = {};

//Load settings and initialise supporting structures
const settings: ServerSetting[] = rawSettings.map((item, index): ServerSetting => 
	{
		const setting = new ServerSetting( item as JSONServerSetting )
	
		indices[setting.guild_id] = index;
		let tag = setting.tag;
		if (tag !== null) {
			if (!clanCache.hasOwnProperty(tag)) {
				clanCache[tag] = [];
			}
			clanCache[tag].push(setting.guild_id);
		}

		rewards.loadRewards(setting);
		for (const webhook of setting.webhooks) {
			subscribe(webhook.clan, webhook.url);
		}

		return setting;
	});

//Save settings to uplift settings.json
updateSettings();

export function updateSettings() {
	fs.writeFile("./settings.json", JSON.stringify(settings, null, 4), (err) => {
		if (err) {
			console.error( "updateSettings()",err);
		}
	});
}

export function getServerContext(guild: Snowflake): ServerSetting | null {
	if (indices.hasOwnProperty(guild)) {
		return settings[indices[guild]];
	}
	return null;
}

export function setServerSetting(setting: ServerSetting) {
	if (!indices.hasOwnProperty(setting.guild_id)) {
		indices[setting.guild_id] = Object.keys(indices).length;
		console.log(`Added new server ${setting.guild_id} at index ${settings.length}`);
	}
	settings[indices[setting.guild_id]] = setting;
	updateSettings();
}

export function removeServerSetting(guild: Snowflake) {
	if (indices.hasOwnProperty(guild)) {
		updateClanTag(settings[indices[guild]], null);
		settings.splice(indices[guild], 1);
		delete indices[guild];
		updateSettings();
		for (const i in settings) {
			indices[settings[i].guild_id] = parseInt(i);
		}
	}
}

export function updateClanTag(context: ServerSetting, tag: string | null) {
	if (context.tag === tag) return;
	if (context.tag !== null && clanCache.hasOwnProperty(context.tag)) {
		clanCache[context.tag].splice(clanCache[context.tag].indexOf(context.guild_id), 1);
	}
	context.tag = tag;
	if (tag !== null) {
		if (!clanCache.hasOwnProperty(tag)) {
			clanCache[tag] = [];
		}
		clanCache[tag].push(context.guild_id);
	}
	updateSettings();
}

export function getGuildsForClan(clan: string): Snowflake[] {
	if (clanCache.hasOwnProperty(clan)) {
		return clanCache[clan];
	}
	return [];
}