const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadConfig } = require('./setup');

// Parse time string (e.g., "1h", "30m") to milliseconds
function parseTime(timeStr) {
    const match = timeStr.match(/^(\d+)([hm])$/);
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    if (unit === 'h') {
        return value * 60 * 60 * 1000;
    } else if (unit === 'm') {
        return value * 60 * 1000;
    }
    return null;
}

// Format time for display
function formatTime(ms) {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    
    if (hours > 0 && minutes > 0) {
        return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h`;
    } else {
        return `${minutes}m`;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('prison')
        .setDescription('Confine a user to solitary confinement')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to confine')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('time')
                .setDescription('Confinement duration (e.g., 1h, 30m)')
                .setRequired(true)),
    
    async execute(interaction) {
        try {
            const punisher = interaction.member;
            const user = interaction.options.getUser('user');
            const targetMember = await interaction.guild.members.fetch(user.id);
            const timeStr = interaction.options.getString('time');

            // Load config to get punisher role
            const config = loadConfig();
            const guildConfig = config[interaction.guild.id];

            if (!guildConfig || !guildConfig.punisherRoleId) {
                return await interaction.reply({ 
                    content: 'This server has not been set up yet! Ask the server owner to run `/setup` first.', 
                    ephemeral: true 
                });
            }

            const punisherRoleId = guildConfig.punisherRoleId;

            // Check if punisher has the required role
            if (!punisher.roles.cache.has(punisherRoleId)) {
                return await interaction.reply({ 
                    content: `You need the <@&${punisherRoleId}> role to use this command!`, 
                    ephemeral: true 
                });
            }

            // Check if target has the punisher role
            if (targetMember.roles.cache.has(punisherRoleId)) {
                return await interaction.reply({ 
                    content: `You cannot punish ${user} because they have the punisher role!`, 
                    ephemeral: true 
                });
            }

            // Can't punish yourself
            if (punisher.id === user.id) {
                return await interaction.reply({ 
                    content: 'You cannot punish yourself!', 
                    ephemeral: true 
                });
            }

            // Check if user has safeword active
            const safewords = interaction.client.safewords;
            if (safewords.has(user.id)) {
                return await interaction.reply({ 
                    content: `${user} has their safeword active and cannot be punished right now.`, 
                    ephemeral: true 
                });
            }

            // Parse time
            const duration = parseTime(timeStr);
            if (!duration) {
                return await interaction.reply({ 
                    content: 'Invalid time format! Use format like: 1h, 30m, 2h, etc.', 
                    ephemeral: true 
                });
            }

            if (duration < 60000) {
                return await interaction.reply({ 
                    content: 'Time must be at least 1 minute!', 
                    ephemeral: true 
                });
            }

            // Initialize prison map if it doesn't exist
            if (!interaction.client.prisons) {
                interaction.client.prisons = new Map();
            }
            const prisons = interaction.client.prisons;

            // Check if user is already in prison
            if (prisons.has(user.id)) {
                return await interaction.reply({ 
                    content: `${user} is already in confinement!`, 
                    ephemeral: true 
                });
            }

            const guild = interaction.guild;

            // Create or fetch "confinement" channel
            const generalChannel = guild.channels.cache.find(ch => 
                ch.name === 'general' || ch.name === 'general-chat' || ch.type === 0
            );
            
            const permissionOverwrites = generalChannel 
                ? Array.from(generalChannel.permissionOverwrites.cache.values())
                : [];

            let confinementChannel = guild.channels.cache.find(ch => ch.name === '「✦confinement✦」');
            if (!confinementChannel) {
                confinementChannel = await guild.channels.create({
                    name: '「✦confinement✦」',
                    type: 0,
                    parent: generalChannel?.parent,
                    permissionOverwrites: permissionOverwrites
                });
                console.log(`Confinement channel created: ${confinementChannel.id}`);
            }

            // Hide all other channels from the user (except confinement)
            const channels = guild.channels.cache.filter(ch => 
                ch.type === 0 || ch.type === 2 // Text and Voice only
            );
            
            const hiddenChannels = [];
            for (const [id, channel] of channels) {
                if (channel.id !== confinementChannel.id) {
                    try {
                        const permissions = channel.permissionsFor(user);
                        if (permissions && permissions.has(PermissionFlagsBits.ViewChannel)) {
                            await channel.permissionOverwrites.edit(user.id, { 
                                ViewChannel: false 
                            });
                            hiddenChannels.push(id);
                        }
                    } catch (err) {
                        console.error(`Could not hide channel ${channel.name}:`, err.message);
                    }
                }
            }

            // Calculate end time
            const endTime = Date.now() + duration;
            const endDate = new Date(endTime);

            // Store prison info
            prisons.set(user.id, {
                channelId: confinementChannel.id,
                endTime: endTime,
                duration: duration,
                hiddenChannels: hiddenChannels,
                punisherId: punisher.id
            });

            // Set timeout to release user
            const timeoutId = setTimeout(async () => {
                const prisonData = prisons.get(user.id);
                if (!prisonData) return;

                // Restore all hidden channels
                if (prisonData.hiddenChannels && prisonData.hiddenChannels.length > 0) {
                    for (const channelId of prisonData.hiddenChannels) {
                        const channel = guild.channels.cache.get(channelId);
                        if (channel) {
                            try {
                                await channel.permissionOverwrites.delete(user.id);
                            } catch (err) {
                                console.error(`Could not restore channel:`, err.message);
                            }
                        }
                    }
                }

                // Send release message
                const confChannel = guild.channels.cache.get(prisonData.channelId);
                if (confChannel) {
                    await confChannel.send(`🔓 ${user} **Your confinement has ended!** You are now free and can access all channels again.`);
                }

                prisons.delete(user.id);
            }, duration);

            // Store timeout ID so we can cancel it if needed
            prisons.get(user.id).timeoutId = timeoutId;

            await interaction.reply({ 
                content: `🔒 ${user} has been confined for ${formatTime(duration)}. Check <#${confinementChannel.id}>`, 
                ephemeral: false 
            });

            // Format the end time in a user-friendly way
            const endTimeUnix = Math.floor(endTime / 1000);

            // Send message to confinement channel
            await confinementChannel.send({
                content: `🔒 ${user}, you have been confined to solitary confinement.\n\n⏰ **Your sentence will end:** <t:${endTimeUnix}:F> (<t:${endTimeUnix}:R>)\n📏 **Duration:** ${formatTime(duration)}\n\nYou cannot access any other channels until your sentence is complete.`
            });

        } catch (err) {
            console.error('Error in prison command:', err);
            await interaction.reply({ 
                content: 'An error occurred while setting up confinement.', 
                ephemeral: true 
            });
        }
    },
};