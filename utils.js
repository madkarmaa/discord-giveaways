const DiscordV12 = require("discord.js-v12"),
DiscordV11 = require("discord.js-v11");

const giveaways = require("./giveaways.json"),
fs = require("fs"),
path = require("path");

let parentDirectory = __dirname.split(path.sep);
parentDirectory.pop();
let jsonPath = parentDirectory.join(path.sep)+path.sep+"giveaways.json";

/**
 * Gets the discord.js version of the user
 * @param {object} client The discord client
 */
function getVersion(client){
    if(client.ws){
        return "v12";
    } else {
        return "v11";
    }
}

/**
 * Parse ms and returns a string
 * @param {number} milliseconds The amount of milliseconds
 * @param {object} options The options for parsing
 * @returns The parsed milliseconds
 */
function parseTime(milliseconds, options){
    let roundTowardsZero = milliseconds > 0 ? Math.floor : Math.ceil;
    let days = roundTowardsZero(milliseconds / 86400000),
    hours = roundTowardsZero(milliseconds / 3600000) % 24,
    minutes = roundTowardsZero(milliseconds / 60000) % 60,
    seconds = roundTowardsZero(milliseconds / 1000) % 60;
    let isDays = days > 0,
    isHours = hours > 0,
    isMinutes = minutes > 0;
    let pattern = 
    (!isDays ? "" : ((isHours || isMinutes || isSeconds) ? `{days} ${options.messages.units.days}, ` : `{days} ${options.messages.units.days}`))+
    (!isHours ? "" : ((isMinutes || isSeconds) ? `{hours} ${options.messages.units.hours}, ` : `{hours} ${options.messages.units.hours}`))+
    (!isMinutes ? "" : ((isSeconds) ? `{minutes} ${options.messages.units.minutes}, ` : `{minutes} ${options.messages.units.minutes}`))+
    (`{seconds} ${options.messages.units.seconds}`);
    let sentence = options.messages.timeRemaining
        .replace("{duration}", pattern)
        .replace("{days}", days)
        .replace("{hours}", hours)
        .replace("{minutes}", minutes)
        .replace("{seconds}", seconds);
    return sentence;
}

/**
 * Mark a giveaway as ended
 * @param {sting} giveawayID The ID of the giveaway to mark as ended
 */
function markAsEnded(giveawayID){
    let giveaways = require(jsonPath);
    giveaways.find((g) => g.giveawayID === giveawayID).ended = true;
    fs.writeFileSync(jsonPath, JSON.stringify(giveaways), "utf-8");
}

/**
 * Starts a giveaway in the channel with the options and the settings
 * @param {object} channel The Discord channel in which the giveaway will start
 * @param {object} options The options for the giveaway
 * @param {object} settings The settings defined with the launch() function
 */
async function start(channel, options, settings){
    return new Promise(function(resolve, reject){
        let endAt = Date.now()+options.time,
        remaining = endAt-Date.now(),
        sentence = parseTime(remaining, options),
        version = getVersion(settings.client),
        embed = null;
        if(version === "v12"){
            embed = new DiscordV12.MessageEmbed();
        } else {
            embed = new DiscordV11.RichEmbed();
        }
        embed.setAuthor(options.prize)
            .setColor(settings.embedColor)
            .setFooter(options.winnersCount + " " + options.messages.winners)
            .setDescription(options.messages.inviteToParticipate+"\n"+sentence)
            .setTimestamp(new Date(endAt).toISOString());

        guildChannel.send(options.messages.giveaway, { embed: embed }).then((msg) => {
            msg.react(settings.reaction);
            let giveawayData = {
                messageID: msg.id,
                channelID: guildChannel.id,
                guildID: guildChannel.guild.id,
                prize: options.prize,
                time: options.time,
                createdAt: Date.now(),
                giveawayID: randomstring.generate(5),
                winnersCount: options.winnersCount,
                messages: options.messages,
                ended: false
            }
            giveaways.push(giveawayData);
            fs.writeFileSync(jsonPath, JSON.stringify(giveaways), "utf-8");
            resolve(giveawayData);
        });
    });
}

async function endGiveaway(giveawayData, channel, message, settings){
    let version = getVersion(message.client);
    let embed = null;
    if(version === "v12"){
        embed = new DiscordV12.MessageEmbed();
    } else {
        embed = new DiscordV11.RichEmbed();
    }
    let guild = channel.guild;
    let reaction = message.reactions.find((r) => r._emoji.name === settings.reaction);
    if(version === "v12"){
        reaction.users = await reaction.users.fetch();
    } else {
        reaction.users = await reaction.fetchUsers();
    }
    if(reaction){
        let users = (settings.botsCanWin ?
            reaction.users
                .filter((u) => u.id !== message.client.id)
                .filter((u) => guild.members.get(u.id)) : 
            reaction.users
                .filter((u) => !u.bot)
                .filter((u) => u.id !== message.client.id)
                .filter((u) => guild.members.get(u.id))
        );
        users.forEach((user) => {
            let member = guild.members.get(user.id);
            settings.ignoreIfHasPermission.forEach((perm) => {
                if(member.hasPermission(perm)){
                    users = users.filter((u) => u.id !== user.id);
                }
            });
        });
        if(users.size > 0){
            let uWinners = users.random(giveawayData.winnersCount).filter((u) => u);
            let winners = uWinners.map((w) => "<@"+w.id+">").join(", ");
            let str = giveawayData.messages.winners.substr(0, 1).toUpperCase()+
            giveawayData.messages.winners.substr(1, giveawayData.messages.winners.length)+": "+winners;
            embed.setAuthor(giveawayData.prize)
                .setColor("#000000")
                .setFooter(giveawayData.messages.endedAt)
                .setDescription(str)
                .setTimestamp(new Date(giveawayData.endAt).toISOString());
            message.edit(giveawayData.messages.giveawayEnded, { embed: embed });
            message.channel.send(
                giveawayData.messages.winMessage
                    .replace("{winners}", winners)
                    .replace("{prize}", giveawayData.prize)
            )
            markAsEnded(giveawayData.giveawayID);
        } else {
            embed.setAuthor(giveawayData.prize)
                .setColor("#000000")
                .setFooter(giveawayData.messages.endedAt)
                .setDescription(giveawayData.messages.noWinner)
                .setTimestamp(new Date(giveawayData.endAt).toISOString());
            message.edit(giveawayData.messages.giveawayEnded, { embed: embed });
            markAsEnded(giveawayData.giveawayID);
        }
    } else {
        embed.setAuthor(giveawayData.prize)
            .setColor("#000000")
            .setFooter(giveawayData.messages.endedAt)
            .setDescription(giveawayData.messages.noWinner)
            .setTimestamp(new Date(giveawayData.endAt).toISOString());
        message.edit(giveawayData.messages.giveawayEnded, { embed: embed });
        markAsEnded(giveawayData.giveawayID);
    }
}

async function check(client, settings){

    let version = getVersion(client);

    giveaways.filter((g) => !g.ended).forEach(async (giveaway) => {
        giveaway.endAt = parseInt(giveaway.createdAt+giveaway.time);
        let channel = client.channels.get(giveaway.channelID);
        if(channel){
            let message = null;
            if(version === "v11"){
                message = await channel.fetchMessage(giveaway.messageID).catch((err) => {});
            } else {
                message = await channel.messages.fetch(giveaway.messageID);
            }
            if(message){
                let remaining = giveaway.endAt - Date.now(),
                sentence = parseTime(remaining, giveaway),
                version = getVersion(settings.client),
                embed = null;
                if(version === "v12"){
                    embed = new DiscordV12.MessageEmbed();
                } else {
                    embed = new DiscordV11.RichEmbed();
                }
                embed.setAuthor(giveaway.prize)
                    .setColor(settings.embedColor)
                    .setFooter(String(giveaway.winnersCount) + " " + giveaway.messages.winners)
                    .setDescription(giveaway.messages.inviteToParticipate+"\n"+sentence)
                    .setTimestamp(new Date(giveaway.endAt).toISOString());
                message.edit(giveaway.messages.giveaway, { embed: embed});
                if(remaining < settings.updateCountdownEvery){
                    setTimeout(function(){
                        endGiveaway(giveaway, channel, message, settings);
                    }, remaining);
                }
            } else {
                markAsEnded(giveaway.giveawayID);
            }
        } else {
            markAsEnded(giveaway.giveawayID);
        }
    });

}

module.exports = {
    parseTime,
    markAsEnded,
    start,
    check
};