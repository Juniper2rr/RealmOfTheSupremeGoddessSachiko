const { AttachmentBuilder } = require('discord.js');
const { createCanvas } = require('canvas');

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

// Get random affirmation (avoid repeating)
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
    let affirmation;
    let attempts = 0;
    do {
        affirmation = affirmations[Math.floor(Math.random() * affirmations.length)];
        attempts++;
    } while (affirmation === lastAffirmation && attempts < 10);
    
    return affirmation;
}

// Helper to lock user in channel
async function lockUserInChannel(guild, user, positivityChannel, positivityTasks) {
    const task = positivityTasks.get(user.id);
    if (!task || task.isLocked) return;
    
    const channels = guild.channels.cache.filter(ch => ch.type === 0 || ch.type === 2);
    const hiddenChannels = [];
    
    for (const [id, channel] of channels) {
        if (channel.id !== positivityChannel.id) {
            try {
                const permissions = channel.permissionsFor(user);
                if (permissions && permissions.has('ViewChannel')) {
                    await channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
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

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (message.author.bot) return;

        const positivityTasks = message.client.positivityTasks;
        const task = positivityTasks.get(message.author.id);
        
        if (!task) return;
        if (message.channel.id !== task.channelId) return;

        try {
            // Check if they typed the correct affirmation
            if (message.content === task.currentAffirmation) {
                await message.react('✅');
                
                // Release them from the channel
                if (task.isLocked) {
                    if (task.hiddenChannels && task.hiddenChannels.length > 0) {
                        for (const channelId of task.hiddenChannels) {
                            const channel = message.guild.channels.cache.get(channelId);
                            if (channel) {
                                try {
                                    await channel.permissionOverwrites.delete(message.author.id);
                                } catch (err) {
                                    console.error(`Could not restore channel ${channel.name}:`, err.message);
                                }
                            }
                        }
                    }
                    
                    task.isLocked = false;
                    task.hiddenChannels = [];
                }
                
                // Mark this affirmation as complete
                task.currentAffirmation = null;
                task.postsRemaining--;
                
                // Check if all affirmations are done
                if (task.postsRemaining <= 0 || Date.now() >= task.endTime) {
                    await message.reply(`${message.author} 💖 Perfect! You've completed all your affirmations!`);
                    
                    if (task.timeoutId) {
                        clearTimeout(task.timeoutId);
                    }
                    positivityTasks.delete(message.author.id);
                    return;
                }
                
                await message.reply(`${message.author} 💖 Perfect! You're doing great! You're free until the next affirmation.`);
                
                // Schedule next affirmation AFTER completion
                task.timeoutId = setTimeout(async () => {
                    const currentTask = positivityTasks.get(message.author.id);
                    if (!currentTask) return;
                    
                    // // Check if task expired
                    // if (Date.now() >= currentTask.endTime) {
                    //     positivityTasks.delete(message.author.id);
                    //     await message.channel.send(`${message.author} ⏰ Your positivity task has ended!`);
                    //     return;
                    // }
                    
                    // Generate new affirmation
                    const lastAffirmation = currentTask.lastAffirmationBase;
                    const newAffirmation = getRandomAffirmation(lastAffirmation);
                    const newRandomized = randomCase(newAffirmation);
                    
                    currentTask.currentAffirmation = newRandomized;
                    currentTask.lastAffirmationBase = newAffirmation;
                    
                    // Lock them in
                    await lockUserInChannel(message.guild, message.author, message.channel, positivityTasks);
                    
                    // Post new affirmation
                    const imageBuffer = createTextImage(newRandomized);
                    const attachment = new AttachmentBuilder(imageBuffer, { name: 'affirmation.png' });
                    
                    const postNumber = currentTask.totalPosts - currentTask.postsRemaining + 1;
                    await message.channel.send({
                        content: `${message.author}, time for your positive affirmation! 💖\n\n**Affirmation ${postNumber}/${currentTask.totalPosts}:** Type this exactly:`,
                        files: [attachment]
                    });
                }, task.interval);
                
            } else {
                await message.react('❌');
                await message.reply(`${message.author} ❌ Not quite right. Please type it exactly as shown in the image above.`);
            }
        } catch (err) {
            console.error('Error processing positivity message:', err);
        }
    },
};