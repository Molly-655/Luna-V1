const fs = require('fs');
const path = require('path');
const ytdl = require('@distube/ytdl-core');
const yts = require('yt-search');
const { logInfo, logError, logSuccess, logWarning } = require('../../utils/logger');
const languageManager = require('../../language/language');
const { config } = require('../../config/globals');
const lang = languageManager.initialize(config);
const userSessions = new Map();

module.exports = {
    name: 'ytb',
    alias: ['youtube', 'yt', 'music', 'song'],
    description: 'Search and download YouTube videos/audio',
    usage: 'ytb <song name>',
    category: 'media',
    permission: 0,
    cooldown: 10,

    run: async function ({ sock, m, args, command, sender }) {
        try {
            const threadID = m.key.remoteJid;
            const userNumber = sender.replace(/[^0-9]/g, '');

            if (!args || args.length === 0) {
                return sock.sendMessage(threadID, {
                    text: `❌ *Usage:* ${global.prefix}${command} <song name>\n\n*Example:* ${global.prefix}${command} shape of you`
                }, { quoted: m });
            }

            const searchQuery = args.join(' ');
            const searchingMsg = await sock.sendMessage(threadID, {
                text: `🔍 *Searching for:* "${searchQuery}"\n\n⏳ Please wait...`
            }, { quoted: m });

            const searchResults = await yts(searchQuery);
            if (!searchResults.videos || searchResults.videos.length === 0) {
                return sock.sendMessage(threadID, {
                    text: `❌ No results found for "${searchQuery}"`
                }, { quoted: m });
            }

            const topResults = searchResults.videos.slice(0, 5);
            let resultMessage = `🎵 *Search Results for:* "${searchQuery}"\n\n`;
            topResults.forEach((video, index) => {
                const duration = video.duration?.timestamp || 'Unknown';
                const views = video.views ? formatViews(video.views) : 'Unknown';
                const author = video.author?.name || 'Unknown';
                resultMessage += `*${index + 1}.* ${video.title}\n👤 ${author}\n⏱️ ${duration} | 👁️ ${views}\n\n`;
            });

            resultMessage += `📝 *Reply with a number (1-5) to select a song*`;
            const resultsMsg = await sock.sendMessage(threadID, { text: resultMessage }, { quoted: m });

            userSessions.set(userNumber, {
                step: 'selection',
                results: topResults,
                messageId: resultsMsg.key.id,
                threadID: threadID,
                timestamp: Date.now()
            });

            if (!global.Luna) global.Luna = {};
            if (!global.Luna.onReply) global.Luna.onReply = new Map();

            global.Luna.onReply.set(resultsMsg.key.id, {
                callback: function (props) {
                    const userInput = props.m?.message?.conversation || props.m?.message?.extendedTextMessage?.text || '';
                    handleSongSelection({ ...props, messageInfo: { ...props.messageInfo, messageText: userInput } });
                },
                oneTime: false
            });

            setTimeout(() => {
                if (userSessions.has(userNumber)) {
                    userSessions.delete(userNumber);
                    global.Luna.onReply.delete(resultsMsg.key.id);
                }
            }, 5 * 60 * 1000);

            logInfo(`YouTube search performed by ${userNumber}: "${searchQuery}"`);
        } catch (error) {
            logError(`YouTube search error: ${error.message}`);
            return sock.sendMessage(m.key.remoteJid, {
                text: `❌ *Error occurred while searching*\n\n${error.message}`
            }, { quoted: m });
        }
    }
};

async function handleSongSelection({ sock, m, sender, messageInfo }) {
    try {
        const userNumber = sender.replace(/[^0-9]/g, '');
        const threadID = m.key.remoteJid;
        const userInput = messageInfo.messageText?.trim();

        if (!userSessions.has(userNumber)) return;
        const session = userSessions.get(userNumber);

        if (session.step === 'selection') {
            const results = session.results;
            const selection = parseInt(userInput);

            if (isNaN(selection) || selection < 1 || selection > results.length) {
                return sock.sendMessage(threadID, {
                    text: `❌ *Invalid selection!*\n\nPlease reply with a number between 1-${results.length}`
                }, { quoted: m });
            }

            const selectedVideo = results[selection - 1];
            const optionsMessage = `🎵 *Selected:* ${selectedVideo.title}\n👤 *By:* ${selectedVideo.author?.name || 'Unknown'}\n⏱️ *Duration:* ${selectedVideo.duration?.timestamp || 'Unknown'}\n\n📥 *Choose download format:*\n\n*1.* 📹 Download Video (MP4)\n*2.* 🎵 Download Audio (MP3)\n\n📝 *Reply with 1 or 2*`;

            const optionsMsg = await sock.sendMessage(threadID, {
                text: optionsMessage
            }, { quoted: m });

            session.step = 'format';
            session.selectedVideo = selectedVideo;
            session.optionsMessageId = optionsMsg.key.id;

            global.Luna.onReply.set(optionsMsg.key.id, {
                callback: function (props) {
                    const userInput = props.m?.message?.conversation || props.m?.message?.extendedTextMessage?.text || '';
                    handleFormatSelection({ ...props, messageInfo: { ...props.messageInfo, messageText: userInput } });
                },
                oneTime: false
            });
        }
    } catch (error) {
        logError(`Song selection error: ${error.message}`);
    }
}

async function handleFormatSelection({ sock, m, sender, messageInfo }) {
    try {
        const userNumber = sender.replace(/[^0-9]/g, '');
        const threadID = m.key.remoteJid;
        const userInput = messageInfo.messageText?.trim();

        if (!userSessions.has(userNumber)) return;
        const session = userSessions.get(userNumber);

        if (session.step === 'format') {
            const formatChoice = parseInt(userInput);
            if (formatChoice !== 1 && formatChoice !== 2) {
                return sock.sendMessage(threadID, {
                    text: `❌ *Invalid choice!*\n\nPlease reply with:\n*1* for Video\n*2* for Audio`
                }, { quoted: m });
            }

            const isVideo = formatChoice === 1;
            const selectedVideo = session.selectedVideo;

            await sock.sendMessage(threadID, {
                text: `⏳ *Processing ${isVideo ? 'video' : 'audio'} download...*\n🎵 ${selectedVideo.title}\n📱 This may take a few moments`
            }, { quoted: m });

            await downloadYouTubeContent(sock, threadID, selectedVideo, isVideo, m);
            userSessions.delete(userNumber);
            global.Luna.onReply.delete(session.messageId);
            global.Luna.onReply.delete(session.optionsMessageId);
        }
    } catch (error) {
        logError(`Format selection error: ${error.message}`);
    }
}

async function downloadYouTubeContent(sock, threadID, video, isVideo, quotedMessage) {
    try {
        const videoUrl = video.url;
        const videoTitle = sanitizeFilename(video.title);
        const fileExtension = isVideo ? 'mp4' : 'mp3';
        const fileName = `${videoTitle}.${fileExtension}`;
        const filePath = path.join(__dirname, '../../temp', fileName);

        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const info = await ytdl.getInfo(videoUrl);
        if (!info) throw new Error('Video information not available');

        // Load cookie
        const cookiePath = path.join(__dirname, '../../cookie/ytb.txt');
        const cookie = fs.existsSync(cookiePath) ? fs.readFileSync(cookiePath, 'utf8') : '';

        const stream = ytdl(videoUrl, {
            quality: isVideo ? 'highestvideo' : 'highestaudio',
            filter: isVideo ? 'videoandaudio' : 'audioonly',
            requestOptions: {
                headers: {
                    'Cookie': cookie
                }
            }
        });

        const writeStream = fs.createWriteStream(filePath);
        await new Promise((resolve, reject) => {
            stream.pipe(writeStream);
            stream.on('error', reject);
            writeStream.on('error', reject);
            writeStream.on('finish', resolve);
        });

        const fileSizeInMB = fs.statSync(filePath).size / (1024 * 1024);
        if (fileSizeInMB > 100) {
            fs.unlinkSync(filePath);
            return sock.sendMessage(threadID, {
                text: `❌ *File too large!* (${fileSizeInMB.toFixed(2)}MB)\nLimit: 100MB`
            }, { quoted: quotedMessage });
        }

        const caption = `🎵 *${video.title}*\n👤 *By:* ${video.author.name}\n⏱️ *Duration:* ${video.duration.timestamp}\n📁 *Format:* ${isVideo ? 'Video (MP4)' : 'Audio (MP3)'}\n📊 *Size:* ${fileSizeInMB.toFixed(2)}MB`;

        if (isVideo) {
            await sock.sendMessage(threadID, {
                video: fs.readFileSync(filePath),
                caption: caption,
                mimetype: 'video/mp4'
            }, { quoted: quotedMessage });
        } else {
            await sock.sendMessage(threadID, {
                audio: fs.readFileSync(filePath),
                mimetype: 'audio/mpeg',
                fileName: `${videoTitle}.mp3`,
                ptt: false
            }, { quoted: quotedMessage });

            await sock.sendMessage(threadID, { text: caption }, { quoted: quotedMessage });
        }

        fs.unlinkSync(filePath);
        logSuccess(`Successfully sent ${isVideo ? 'video' : 'audio'}: ${video.title}`);
    } catch (error) {
        logError(`Download error: ${error.message}`);
        sock.sendMessage(threadID, {
            text: `❌ *Download failed!*\n\nError: ${error.message}`
        }, { quoted: quotedMessage });
    }
}

function formatViews(views) {
    if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
    if (views >= 1000) return (views / 1000).toFixed(1) + 'K';
    return views.toString();
}

function sanitizeFilename(filename) {
    return filename.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').substring(0, 100);
}

setInterval(() => {
    const now = Date.now();
    const expireTime = 5 * 60 * 1000;
    for (const [userNumber, session] of userSessions.entries()) {
        if (now - session.timestamp > expireTime) {
            userSessions.delete(userNumber);
            if (session.messageId) global.Luna.onReply.delete(session.messageId);
            if (session.optionsMessageId) global.Luna.onReply.delete(session.optionsMessageId);
        }
    }
}, 60000);