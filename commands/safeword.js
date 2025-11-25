const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sw')
        .setDescription('Use your safeword to stop all punishments')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Start or end safeword protection')
                .setRequired(true)
                .addChoices(
                    { name: 'Start', value: 'start' },
                    { name: 'End', value: 'end' }
                )),
    
    async execute(interaction) {
        try {
            const user = interaction.user;
            const action = interaction.options.getString('action');
            const safewords = interaction.client.safewords;

            if (action === 'start') {
                // Check if already using safeword
                if (safewords.has(user.id)) {
                    return await interaction.reply({ 
                        content: '🛑 You are already protected by safeword.', 
                        ephemeral: true 
                    });
                }

                // End all active punishments for this user
                const punishments = interaction.client.punishments;
                const positivityTasks = interaction.client.positivityTasks;
                const squabbles = interaction.client.squabbles;

                let releasedFrom = [];

                // Check lines punishment
                if (punishments.has(user.id)) {
                    const punishment = punishments.get(user.id);
                    
                    // Restore all hidden channels
                    if (punishment.hiddenChannels && punishment.hiddenChannels.length > 0) {
                        for (const channelId of punishment.hiddenChannels) {
                            const channel = interaction.guild.channels.cache.get(channelId);
                            if (channel) {
                                try {
                                    await channel.permissionOverwrites.delete(user.id);
                                } catch (err) {
                                    console.error(`Could not restore channel:`, err.message);
                                }
                            }
                        }
                    }
                    
                    punishments.delete(user.id);
                    releasedFrom.push('lines');
                }

                // Check positivity task
                if (positivityTasks.has(user.id)) {
                    const task = positivityTasks.get(user.id);
                    
                    // Clear timeout
                    if (task.timeoutId) {
                        clearTimeout(task.timeoutId);
                    }
                    
                    // Restore channels if locked
                    if (task.isLocked && task.hiddenChannels) {
                        for (const channelId of task.hiddenChannels) {
                            const channel = interaction.guild.channels.cache.get(channelId);
                            if (channel) {
                                try {
                                    await channel.permissionOverwrites.delete(user.id);
                                } catch (err) {
                                    console.error(`Could not restore channel:`, err.message);
                                }
                            }
                        }
                    }
                    
                    positivityTasks.delete(user.id);
                    releasedFrom.push('positivity');
                }

                // Check squabble
                if (squabbles.has(user.id)) {
                    const squabble = squabbles.get(user.id);
                    const partnerId = squabble.partnerId;
                    
                    // Restore channels
                    if (squabble.hiddenChannels && squabble.hiddenChannels.length > 0) {
                        for (const channelId of squabble.hiddenChannels) {
                            const channel = interaction.guild.channels.cache.get(channelId);
                            if (channel) {
                                try {
                                    await channel.permissionOverwrites.delete(user.id);
                                } catch (err) {
                                    console.error(`Could not restore channel:`, err.message);
                                }
                            }
                        }
                    }
                    
                    // Notify partner
                    const partner = await interaction.client.users.fetch(partnerId);
                    const makeUpChannel = interaction.guild.channels.cache.get(squabble.channelId);
                    if (makeUpChannel) {
                        await makeUpChannel.send(`🛑 ${user} has used their safeword. ${partner}, you may continue or use your safeword as well.`);
                    }
                    
                    squabbles.delete(user.id);
                    releasedFrom.push('squabble');
                }

                // Activate safeword protection
                safewords.set(user.id, {
                    startedAt: Date.now(),
                    guildId: interaction.guild.id
                });

                let message = `🛑 **SAFEWORD ACTIVATED**\n\n${user}, you are now protected. All active punishments have been ended and you cannot be punished until you use \`/safeword end\`.`;
                
                if (releasedFrom.length > 0) {
                    message += `\n\n✅ Released from: ${releasedFrom.join(', ')}`;
                }

                await interaction.reply({ 
                    content: message, 
                    ephemeral: false 
                });

            } else if (action === 'end') {
                // Check if using safeword
                if (!safewords.has(user.id)) {
                    return await interaction.reply({ 
                        content: 'You are not currently using safeword protection.', 
                        ephemeral: true 
                    });
                }

                const safewordData = safewords.get(user.id);
                const duration = Date.now() - safewordData.startedAt;
                const durationMinutes = Math.floor(duration / 60000);

                safewords.delete(user.id);

                await interaction.reply({ 
                    content: `✅ ${user}, your safeword protection has ended. You were protected for ${durationMinutes} minute(s). You can now be punished again.`, 
                    ephemeral: false 
                });
            }

        } catch (err) {
            console.error('Error in safeword command:', err);
            await interaction.reply({ 
                content: 'An error occurred while processing safeword.', 
                ephemeral: true 
            });
        }
    },
};