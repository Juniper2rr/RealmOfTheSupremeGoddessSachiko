const { SlashCommandBuilder } = require('discord.js');
const { loadConfig } = require('./setup');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('squabbleforgive')
        .setDescription('Forgive and cancel a squabble punishment')
        .addUserOption(option =>
            option.setName('user1')
                .setDescription('First user to forgive')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('user2')
                .setDescription('Second user to forgive (optional)')
                .setRequired(false)),
    
    async execute(interaction) {
        try {
            const punisher = interaction.member;
            const user1 = interaction.options.getUser('user1');
            const user2 = interaction.options.getUser('user2');
            const squabbles = interaction.client.squabbles;

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

            // Check if user1 has an active squabble
            if (!squabbles.has(user1.id)) {
                return await interaction.reply({ 
                    content: `${user1} doesn't have an active squabble punishment.`, 
                    ephemeral: true 
                });
            }

            const squabble1 = squabbles.get(user1.id);
            const partnerId = squabble1.partnerId;
            const partner = await interaction.client.users.fetch(partnerId);

            // Restore channels for user1
            if (squabble1.hiddenChannels && squabble1.hiddenChannels.length > 0) {
                for (const channelId of squabble1.hiddenChannels) {
                    const channel = interaction.guild.channels.cache.get(channelId);
                    if (channel) {
                        try {
                            await channel.permissionOverwrites.delete(user1.id);
                        } catch (err) {
                            console.error(`Could not restore channel:`, err.message);
                        }
                    }
                }
            }

            squabbles.delete(user1.id);

            // Check if we should also forgive the partner
            const shouldForgivePartner = user2 ? user2.id === partnerId : true;

            if (shouldForgivePartner && squabbles.has(partnerId)) {
                const squabble2 = squabbles.get(partnerId);
                
                // Restore channels for partner
                if (squabble2.hiddenChannels && squabble2.hiddenChannels.length > 0) {
                    for (const channelId of squabble2.hiddenChannels) {
                        const channel = interaction.guild.channels.cache.get(channelId);
                        if (channel) {
                            try {
                                await channel.permissionOverwrites.delete(partnerId);
                            } catch (err) {
                                console.error(`Could not restore channel:`, err.message);
                            }
                        }
                    }
                }

                squabbles.delete(partnerId);

                // Send message to make-up channel
                const makeUpChannel = interaction.guild.channels.cache.get(squabble1.channelId);
                if (makeUpChannel) {
                    await makeUpChannel.send(`✨ ${user1} and ${partner} have been forgiven by ${punisher}! Your squabble punishment has been cancelled.`);
                }

                await interaction.reply({ 
                    content: `✅ Forgiven both ${user1} and ${partner}. They had ${squabble1.linesLeft} and ${squabble2.linesLeft} apologies remaining respectively.`, 
                    ephemeral: false 
                });
            } else {
                // Only forgive user1
                const makeUpChannel = interaction.guild.channels.cache.get(squabble1.channelId);
                if (makeUpChannel) {
                    await makeUpChannel.send(`✨ ${user1} has been forgiven by ${punisher}! ${partner} must still complete their apologies.`);
                }

                await interaction.reply({ 
                    content: `✅ Forgiven ${user1}. They had ${squabble1.linesLeft} apologies remaining. ${partner} must still complete their punishment.`, 
                    ephemeral: false 
                });
            }

        } catch (err) {
            console.error('Error in squabbleforgive command:', err);
            await interaction.reply({ 
                content: 'An error occurred while forgiving the squabble.', 
                ephemeral: true 
            });
        }
    },
};