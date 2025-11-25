const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadConfig } = require('./setup');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('linesforgive')
        .setDescription('Forgive a user and cancel their lines punishment')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to forgive')
                .setRequired(true)),
    
    async execute(interaction) {
        try {
            const punisher = interaction.member;
            const user = interaction.options.getUser('user');
            const targetMember = await interaction.guild.members.fetch(user.id);
            const punishments = interaction.client.punishments;

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

            // Check if user has an active punishment
            if (!punishments.has(user.id)) {
                return await interaction.reply({ 
                    content: `${user} doesn't have an active punishment.`, 
                    ephemeral: true 
                });
            }

            const punishment = punishments.get(user.id);
            const guild = interaction.guild;

            // Restore access to all hidden channels
            if (punishment.hiddenChannels && punishment.hiddenChannels.length > 0) {
                for (const channelId of punishment.hiddenChannels) {
                    const channel = guild.channels.cache.get(channelId);
                    if (channel) {
                        try {
                            await channel.permissionOverwrites.delete(user.id);
                        } catch (err) {
                            console.error(`Could not restore channel ${channel.name}:`, err.message);
                        }
                    }
                }
            }

            // Send message to lines channel
            const linesChannel = guild.channels.cache.get(punishment.channelId);
            if (linesChannel) {
                try {
                    await linesChannel.send(`${user} ✨ **You have been forgiven!** Your punishment has been cancelled.`);
                } catch (err) {
                    console.error('Could not send to lines channel:', err.message);
                }
            }

            // Remove punishment
            punishments.delete(user.id);

            await interaction.reply({ 
                content: `✨ ${user} has been forgiven and released from their punishment. They had ${punishment.linesLeft} of ${punishment.totalLines} lines remaining.`, 
                ephemeral: false 
            });

        } catch (err) {
            console.error('Error in linesforgive command:', err);
            await interaction.reply({ 
                content: 'An error occurred while forgiving the user.', 
                ephemeral: true 
            });
        }
    },
};