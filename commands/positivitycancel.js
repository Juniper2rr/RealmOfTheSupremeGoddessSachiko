const { SlashCommandBuilder } = require('discord.js');
const { loadConfig } = require('./setup');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('positivitycancel')
        .setDescription('Cancel a positive affirmation task')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to cancel task for')
                .setRequired(true)),
    
    async execute(interaction) {
        try {
            const punisher = interaction.member;
            const user = interaction.options.getUser('user');
            const positivityTasks = interaction.client.positivityTasks;

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

            // Check if user has an active task
            if (!positivityTasks.has(user.id)) {
                return await interaction.reply({ 
                    content: `${user} doesn't have an active positivity task.`, 
                    ephemeral: true 
                });
            }

            const task = positivityTasks.get(user.id);

            // Clear the timeout
            if (task.timeoutId) {
                clearTimeout(task.timeoutId);
            }

            // Release user if they're locked
            if (task.isLocked && task.hiddenChannels) {
                for (const channelId of task.hiddenChannels) {
                    const channel = interaction.guild.channels.cache.get(channelId);
                    if (channel) {
                        try {
                            await channel.permissionOverwrites.delete(user.id);
                        } catch (err) {
                            console.error(`Could not restore channel ${channel.name}:`, err.message);
                        }
                    }
                }
            }

            // Remove task
            positivityTasks.delete(user.id);

            // Send message to channel
            const channel = interaction.guild.channels.cache.get(task.channelId);
            if (channel) {
                await channel.send(`${user} ✨ Your positivity task has been cancelled by ${punisher}.`);
            }

            await interaction.reply({ 
                content: `✅ Cancelled positivity task for ${user}. They had ${task.postsRemaining} affirmations remaining.`, 
                ephemeral: false 
            });

        } catch (err) {
            console.error('Error in positivitycancel command:', err);
            await interaction.reply({ 
                content: 'An error occurred while cancelling the task.', 
                ephemeral: true 
            });
        }
    },
};