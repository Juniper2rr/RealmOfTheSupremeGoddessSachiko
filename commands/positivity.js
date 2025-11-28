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

// Positive affirmations list
const affirmations = [
    "I am worthy of love and respect",
    "I am capable of achieving my goals",
    "I deserve happiness and joy",
    "I am enough just as I am",
    "I am proud of my progress",
    "I choose to be kind to myself",
    "I am deserving of good things",
    "I believe in my abilities",
    "I am growing and improving every day",
    "I am valuable and important",
    "I deserve care and compassion",
    "I am doing my best and that is enough",
    "I accept myself unconditionally",
    "I am worthy of respect from others and myself",
    "I choose to focus on my strengths",
    "I am deserving of self-care",
    "I trust in my journey",
    "I am allowed to make mistakes",
    "I celebrate my achievements",
    "I am grateful for who I am",
    "My feelings are valid",
    "I am stronger than I think",
    "I deserve to take up space",
    "I am learning and growing",
    "My best is always enough"
];

function getRandomAffirmation(lastAffirmation = null) {
    // Try to avoid repeating the same affirmation
    let affirmation;
    let attempts = 0;
    do {
        affirmation = affirmations[Math.floor(Math.random() * affirmations.length)];
        attempts++;
    } while (affirmation === lastAffirmation && attempts < 10);
    
    return affirmation;
}

// Helper function: Lock user in positivity channel
async function lockUserInChannel(guild, user, positivityChannel, positivityTasks) {
    const task = positivityTasks.get(user.id);
    if (!task || task.isLocked) return; // Already locked
    
    // Hide all other channels
    const channels = guild.channels.cache.filter(ch => 
        ch.type === 0 || ch.type === 2 // Text and Voice only
    );
    
    const hiddenChannels = [];
    for (const [id, channel] of channels) {
        if (channel.id !== positivityChannel.id) {
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
    
    task.hiddenChannels = hiddenChannels;
    task.isLocked = true;
}

// Helper function: Release user from positivity channel
async function releaseUser(guild, user, task) {
    if (!task || !task.isLocked) return; // Not locked
    
    // Restore all hidden channels
    if (task.hiddenChannels && task.hiddenChannels.length > 0) {
        for (const channelId of task.hiddenChannels) {
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
    
    task.isLocked = false;
    task.hiddenChannels = [];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('positivity')
        .setDescription('Assign positive affirmation task')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to assign task to')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('interval')
                .setDescription('How often to post (e.g., 1h, 30m)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('How long the task lasts (e.g., 5h, 90m)')
                .setRequired(true)),
    
    async execute(interaction) {
        try {
            const punisher = interaction.member;
            const user = interaction.options.getUser('user');
            const targetMember = await interaction.guild.members.fetch(user.id);
            const intervalStr = interaction.options.getString('interval');
            const durationStr = interaction.options.getString('duration');

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

            // Parse time values
            const interval = parseTime(intervalStr);
            const duration = parseTime(durationStr);

            if (!interval || !duration) {
                return await interaction.reply({ 
                    content: 'Invalid time format! Use format like: 1h, 30m, 2h, etc.', 
                    ephemeral: true 
                });
            }

            if (interval < 60000) {
                return await interaction.reply({ 
                    content: 'Interval must be at least 1 minute!', 
                    ephemeral: true 
                });
            }

            if (duration < interval) {
                return await interaction.reply({ 
                    content: 'Duration must be longer than interval!', 
                    ephemeral: true 
                });
            }

            const positivityTasks = interaction.client.positivityTasks;

            // Check if user already has an active task
            if (positivityTasks.has(user.id)) {
                return await interaction.reply({ 
                    content: `${user} already has an active positivity task!`, 
                    ephemeral: true 
                });
            }

            const guild = interaction.guild;

            // Create or fetch "positive-affirmations" channel
            const generalChannel = guild.channels.cache.find(ch => 
                ch.name === 'general' || ch.name === 'general-chat' || ch.type === 0
            );
            
            const permissionOverwrites = generalChannel 
                ? Array.from(generalChannel.permissionOverwrites.cache.values())
                : [];

            let positivityChannel = guild.channels.cache.find(ch => ch.name === '「✦positive-affirmations✦」');
            if (!positivityChannel) {
                positivityChannel = await guild.channels.create({
                    name: '「✦positive-affirmations✦」',
                    type: 0,
                    parent: generalChannel?.parent,
                    permissionOverwrites: permissionOverwrites
                });
            }

            // Get first affirmation
            const affirmation = getRandomAffirmation();
            const randomizedText = randomCase(affirmation);

            // Create image
            const imageBuffer = createTextImage(randomizedText);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'affirmation.png' });

            // Calculate total posts
            const totalPosts = Math.floor(duration / interval);

            // Store task info
            const endTime = Date.now() + duration;
            positivityTasks.set(user.id, {
                channelId: positivityChannel.id,
                interval: interval,
                endTime: endTime,
                currentAffirmation: randomizedText,
                lastAffirmationBase: affirmation, // Store base text for comparison
                postsRemaining: totalPosts,
                totalPosts: totalPosts,
                punisherId: punisher.id,
                timeoutId: null, // Use timeout instead of interval
                hiddenChannels: [], // Store hidden channels
                isLocked: false // Track if user is currently locked
            });

            await interaction.reply({ 
                content: `✅ ${user} has been assigned a positivity task!\n📍 Every ${formatTime(interval)} for ${formatTime(duration)} (${totalPosts} affirmations total)\n📺 Check <#${positivityChannel.id}>`, 
                ephemeral: false 
            });

            // Lock user in positive affirmations channel
            await lockUserInChannel(guild, user, positivityChannel, positivityTasks);

            // Post first affirmation
            await positivityChannel.send({
                content: `${user}, time for your positive affirmation! 💖\n\n**Affirmation 1/${totalPosts}:** Type this exactly:`,
                files: [attachment]
            });

        } catch (err) {
            console.error('Error in positivity command:', err);
            await interaction.reply({ 
                content: 'An error occurred while setting up the task.', 
                ephemeral: true 
            });
        }
    },
};