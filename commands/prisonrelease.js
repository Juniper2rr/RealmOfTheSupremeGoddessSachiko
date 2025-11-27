const { SlashCommandBuilder } = require('discord.js');
const { loadConfig } = require('./setup');

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
        .setName('prisonrelease')
        .setDescription('Release a user from confinement early')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to release')
                .setRequired(true)),
    
    async execute(interaction) {
        try {
            const punisher = interaction.member;
            const user = interaction.options.getUser('user');

            // Load config to get punisher role
            const config = loadConfig();
            const guildConfig = config[interaction.guild.id];

            if (!guildConfig || !guildConfig.punisherRoleId) {
                return await interaction.reply({ 
                    content: 'This server has not been set up yet!', 
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

            // Initialize prison map if it doesn't exist
            if (!interaction.client.prisons) {
                interaction.client.prisons = new Map();
            }
            const prisons = interaction.client.prisons;

            // Check if user is in prison
            if (!prisons.has(user.id)) {
                return await interaction.reply({ 
                    content: `${user} is not currently in confinement.`, 
                    ephemeral: true 
                });
            }

            const prisonData = prisons.get(user.id);
            const guild = interaction.guild;

            // Clear the timeout
            if (prisonData.timeoutId) {
                clearTimeout(prisonData.timeoutId);
            }

            // Calculate time served
            const timeServed = Date.now() - (prisonData.endTime - prisonData.duration);
            const timeRemaining = prisonData.endTime - Date.now();

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

            // Send message to confinement channel
            const confinementChannel = guild.channels.cache.get(prisonData.channelId);
            if (confinementChannel) {
                await confinementChannel.send(`🔓 ${user} **You have been released early!** ${punisher} has forgiven your sentence. You can now access all channels again.`);
            }

            // Remove from prison
            prisons.delete(user.id);

            await interaction.reply({ 
                content: `🔓 ${user} has been released from confinement.\n⏱️ **Time served:** ${formatTime(timeServed)}\n⏰ **Time remaining:** ${formatTime(timeRemaining > 0 ? timeRemaining : 0)}`, 
                ephemeral: false 
            });

        } catch (err) {
            console.error('Error in prisonrelease command:', err);
            await interaction.reply({ 
                content: 'An error occurred while releasing the user.', 
                ephemeral: true 
            });
        }
    },
};