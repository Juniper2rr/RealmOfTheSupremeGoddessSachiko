const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const { createCanvas } = require('canvas');
const { loadConfig } = require('./setup');

// Helper function: randomize letter casing
function randomCase(str) {
    return str.split('').map(c => Math.random() > 0.5 ? c.toUpperCase() : c.toLowerCase()).join('');
}

// Helper function: create image of text
function createTextImage(text) {
    const fontSize = 48;
    const padding = 10;
    const lineHeight = fontSize * 1;
    
    const maxWidth = 800;
    const canvas = createCanvas(maxWidth, 200);
    const ctx = canvas.getContext('2d');
    ctx.font = `${fontSize}px monospace`;
    
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];
    
    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + " " + word).width;
        if (width < maxWidth - padding * 2) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    
    const canvasHeight = (lines.length * lineHeight) + (padding * 2);
    const finalCanvas = createCanvas(maxWidth, canvasHeight);
    const finalCtx = finalCanvas.getContext('2d');
    
    finalCtx.fillStyle = '#2b2d31';
    finalCtx.fillRect(0, 0, maxWidth, canvasHeight);
    
    finalCtx.font = `${fontSize}px monospace`;
    finalCtx.fillStyle = '#ffffff';
    finalCtx.textBaseline = 'top';
    
    lines.forEach((line, i) => {
        finalCtx.fillText(line, padding, padding + (i * lineHeight));
    });
    
    return finalCanvas.toBuffer();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('squabble')
        .setDescription('Break up a fight between two users')
        .addUserOption(option =>
            option.setName('user1')
                .setDescription('First user')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('user2')
                .setDescription('Second user')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of apologies each')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(50)),
    
    async execute(interaction) {
        try {
            const punisher = interaction.member;
            const user1 = interaction.options.getUser('user1');
            const user2 = interaction.options.getUser('user2');
            const amount = interaction.options.getInteger('amount');

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

            // Can't use same user twice
            if (user1.id === user2.id) {
                return await interaction.reply({ 
                    content: 'You need to select two different users!', 
                    ephemeral: true 
                });
            }

            // Can't punish bots
            if (user1.bot || user2.bot) {
                return await interaction.reply({ 
                    content: 'You cannot punish bots!', 
                    ephemeral: true 
                });
            }

            const member1 = await interaction.guild.members.fetch(user1.id);
            const member2 = await interaction.guild.members.fetch(user2.id);

            // Check if targets have the punisher role
            if (member1.roles.cache.has(punisherRoleId)) {
                return await interaction.reply({ 
                    content: `You cannot punish ${user1} because they have the punisher role!`, 
                    ephemeral: true 
                });
            }
            if (member2.roles.cache.has(punisherRoleId)) {
                return await interaction.reply({ 
                    content: `You cannot punish ${user2} because they have the punisher role!`, 
                    ephemeral: true 
                });
            }

            // Check if either user has safeword active
            const safewords = interaction.client.safewords;
            if (safewords.has(user1.id)) {
                return await interaction.reply({ 
                    content: `${user1} has their safeword active and cannot be punished right now.`, 
                    ephemeral: true 
                });
            }
            if (safewords.has(user2.id)) {
                return await interaction.reply({ 
                    content: `${user2} has their safeword active and cannot be punished right now.`, 
                    ephemeral: true 
                });
            }

            const squabbles = interaction.client.squabbles;

            // Check if either user already has an active squabble
            if (squabbles.has(user1.id)) {
                return await interaction.reply({ 
                    content: `${user1} already has an active make-up punishment!`, 
                    ephemeral: true 
                });
            }
            if (squabbles.has(user2.id)) {
                return await interaction.reply({ 
                    content: `${user2} already has an active make-up punishment!`, 
                    ephemeral: true 
                });
            }

            const guild = interaction.guild;

            // Create or fetch "make-up" channel
            const generalChannel = guild.channels.cache.find(ch => 
                ch.name === 'general' || ch.name === 'general-chat' || ch.type === 0
            );
            
            const permissionOverwrites = generalChannel 
                ? Array.from(generalChannel.permissionOverwrites.cache.values())
                : [];

            let makeUpChannel = guild.channels.cache.find(ch => ch.name === 'make-up');
            if (!makeUpChannel) {
                makeUpChannel = await guild.channels.create({
                    name: 'make-up',
                    type: 0,
                    parent: generalChannel?.parent,
                    permissionOverwrites: permissionOverwrites
                });
                console.log(`Make-up channel created: ${makeUpChannel.id}`);
            }

            // First, hide all other channels from both users (EXCEPT make-up)
            const channels = guild.channels.cache.filter(ch => 
                ch.type === 0 || ch.type === 2
            );
            
            console.log(`Make-up channel ID to preserve: ${makeUpChannel.id}`);
            
            const hiddenChannels1 = [];
            const hiddenChannels2 = [];
            
            for (const [id, channel] of channels) {
                if (channel.id !== makeUpChannel.id) {
                    try {
                        // Hide from user1
                        const permissions1 = channel.permissionsFor(user1);
                        if (permissions1 && permissions1.has(PermissionFlagsBits.ViewChannel)) {
                            await channel.permissionOverwrites.edit(user1.id, { ViewChannel: false });
                            hiddenChannels1.push(id);
                            console.log(`Hidden from ${user1.username}: ${channel.name}`);
                        }
                        
                        // Hide from user2
                        const permissions2 = channel.permissionsFor(user2);
                        if (permissions2 && permissions2.has(PermissionFlagsBits.ViewChannel)) {
                            await channel.permissionOverwrites.edit(user2.id, { ViewChannel: false });
                            hiddenChannels2.push(id);
                            console.log(`Hidden from ${user2.username}: ${channel.name}`);
                        }
                    } catch (err) {
                        console.error(`Could not hide channel ${channel.name}:`, err.message);
                    }
                } else {
                    console.log(`Skipping make-up channel for both users`);
                }
            }
            
            console.log(`Hidden ${hiddenChannels1.length} channels from user1`);
            console.log(`Hidden ${hiddenChannels2.length} channels from user2`);

            // Generate apology lines for each user
            const apology1 = `I am sorry ${user2.username}`;
            const apology2 = `I am sorry ${user1.username}`;
            
            const randomized1 = randomCase(apology1);
            const randomized2 = randomCase(apology2);

            // Create images
            const image1 = createTextImage(randomized1);
            const image2 = createTextImage(randomized2);
            const attachment1 = new AttachmentBuilder(image1, { name: 'apology1.png' });
            const attachment2 = new AttachmentBuilder(image2, { name: 'apology2.png' });

            // Store squabble info for both users
            squabbles.set(user1.id, {
                channelId: makeUpChannel.id,
                apologizingTo: user2.id,
                apologyBase: apology1,
                currentLine: randomized1,
                linesLeft: amount,
                totalLines: amount,
                hiddenChannels: hiddenChannels1,
                partnerId: user2.id
            });

            squabbles.set(user2.id, {
                channelId: makeUpChannel.id,
                apologizingTo: user1.id,
                apologyBase: apology2,
                currentLine: randomized2,
                linesLeft: amount,
                totalLines: amount,
                hiddenChannels: hiddenChannels2,
                partnerId: user1.id
            });

            await interaction.reply({ 
                content: `🛑 ${user1} and ${user2} need to make up! Both must apologize ${amount} times in <#${makeUpChannel.id}>`, 
                ephemeral: false 
            });

            // Post apology requirements
            await makeUpChannel.send({
                content: `${user1}, you must apologize to ${user2} **${amount} times**.\n\n**Line 1/${amount}:** Type this exactly:`,
                files: [attachment1]
            });

            await makeUpChannel.send({
                content: `${user2}, you must apologize to ${user1} **${amount} times**.\n\n**Line 1/${amount}:** Type this exactly:`,
                files: [attachment2]
            });

        } catch (err) {
            console.error('Error in squabble command:', err);
            await interaction.reply({ 
                content: 'An error occurred while setting up the punishment.', 
                ephemeral: true 
            });
        }
    },
};