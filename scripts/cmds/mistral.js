const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { logInfo, logError, logSuccess, logWarning } = require('../../utils/logger');

// Configuration
const chatHistoryDir = path.join(__dirname, '../../data/mistralChatHistory');
const apiKey = 'PjoBY8G7ytgyH2o2GeMe0e8Z90pXdSgT'; // Your Mistral API key
const systemPrompt = "Examine the prompt and respond precisely as directed, omitting superfluous information. Provide brief responses, typically 1-2 sentences, except when detailed answers like essays, poems, or stories are requested.";

// Ensure chat history directory exists
if (!fs.existsSync(chatHistoryDir)) {
    fs.mkdirSync(chatHistoryDir, { recursive: true });
}

module.exports = {
    name: 'mistral',
    alias: ['mst', 'ai'],
    description: 'Chat with Mistral AI model',
    usage: '{prefix}mistral <your message>\n{prefix}mistral clear - Clear chat history',
    category: 'AI',
    permission: 0, // 0 = everyone, 1 = group admin, 2 = bot admin
    cooldown: 3, 

    run: async function({ sock, m, args, command, sender, messageInfo, isGroup }) {
        try {
            const threadID = m.key.remoteJid;
            const userNumber = sender.replace(/[^0-9]/g, '');
            const prompt = args.join(' ');

            
            if (prompt.toLowerCase() === 'clear') {
                clearChatHistory(userNumber);
                return sock.sendMessage(threadID, { 
                    text: '🗑️ Chat history cleared successfully!' 
                }, { quoted: m });
            }

            
            if (!prompt || prompt.trim() === '') {
                return sock.sendMessage(threadID, { 
                    text: '❌ Please provide a message to chat with Mistral AI.\n\nUsage: `mistral <your message>`' 
                }, { quoted: m });
            }

            
            await sock.sendPresenceUpdate('composing', threadID);

            
            try {
                await sock.sendMessage(threadID, {
                    react: { text: '⏳', key: m.key }
                });
            } catch (e) {
                
            }

            const startTime = Date.now();

            try {
                
                let chatHistory = loadChatHistory(userNumber);

                
                const chatMessages = [
                    { "role": "system", "content": systemPrompt },
                    ...chatHistory,
                    { "role": "user", "content": prompt }
                ];

                logInfo(`[Mistral] Processing request from ${userNumber}: ${prompt.substring(0, 50)}...`);

                
                const chatCompletion = await sendMistralRequest(chatMessages);
                const assistantResponse = chatCompletion.choices[0].message.content;

                // Calculate metrics
                const endTime = Date.now();
                const completionTime = ((endTime - startTime) / 1000).toFixed(2);
                const totalWords = assistantResponse.split(/\s+/).filter(word => word !== '').length;

                // Prepare response message
                let responseMessage = `${assistantResponse}`;

                // Add metrics footer
                responseMessage += `\n\n ⏱️ ${completionTime}s • 📝 ${totalWords} words`;

                // Send response
                const sentMessage = await sock.sendMessage(threadID, { 
                    text: responseMessage 
                }, { quoted: m });

                // Update chat history
                chatHistory.push({ role: "user", content: prompt });
                chatHistory.push({ role: "assistant", content: assistantResponse });

                
                if (chatHistory.length > 20) {
                    chatHistory = chatHistory.slice(-20);
                }

                appendToChatHistory(userNumber, chatHistory);

                
                if (sentMessage && sentMessage.key) {
                    setupReplyHandler(sentMessage.key.id, userNumber, threadID);
                }

                // Add success reaction
                try {
                    await sock.sendMessage(threadID, {
                        react: { text: '✅', key: m.key }
                    });
                } catch (e) {
                    // Ignore reaction errors
                }

                logSuccess(`[Mistral] Request processed successfully for ${userNumber}`);

            } catch (error) {
                logError(`[Mistral] API Error: ${error.message}`);

                // Add error reaction
                try {
                    await sock.sendMessage(threadID, {
                        react: { text: '❌', key: m.key }
                    });
                } catch (e) {
                    // Ignore reaction errors
                }

                let errorMessage = '❌ Sorry, there was an error processing your request.';

                if (error.response) {
                    if (error.response.status === 401) {
                        errorMessage = '❌ API key authentication failed. Please check the configuration.';
                    } else if (error.response.status === 429) {
                        errorMessage = '❌ Rate limit exceeded. Please try again later.';
                    } else if (error.response.status === 500) {
                        errorMessage = '❌ Server error from Mistral AI. Please try again later.';
                    }
                }

                return sock.sendMessage(threadID, { 
                    text: errorMessage 
                }, { quoted: m });
            }

        } catch (error) {
            logError(`[Mistral] Command Error: ${error.message}`);
            return sock.sendMessage(threadID, { 
                text: '❌ An unexpected error occurred. Please try again.' 
            }, { quoted: m });
        }
    }
};

/**
 * Send request to Mistral API
 */
async function sendMistralRequest(messages) {
    try {
        const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
            model: 'mistral-large-latest',
            messages: messages,
            max_tokens: 1000,
            temperature: 0.7
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 second timeout
        });

        return response.data;
    } catch (error) {
        if (error.response) {
            logError(`[Mistral API] Status: ${error.response.status}`);
            logError(`[Mistral API] Error: ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
            logError(`[Mistral API] No response received`);
        } else {
            logError(`[Mistral API] Request setup error: ${error.message}`);
        }
        throw error;
    }
}

/**
 * Load chat history for user
 */
function loadChatHistory(uid) {
    const chatHistoryFile = path.join(chatHistoryDir, `memory_${uid}.json`);

    try {
        if (fs.existsSync(chatHistoryFile)) {
            const fileData = fs.readFileSync(chatHistoryFile, 'utf8');
            const chatHistory = JSON.parse(fileData);
            return Array.isArray(chatHistory) ? chatHistory : [];
        } else {
            return [];
        }
    } catch (error) {
        logError(`[Mistral] Error loading chat history for ${uid}: ${error.message}`);
        return [];
    }
}


function appendToChatHistory(uid, chatHistory) {
    const chatHistoryFile = path.join(chatHistoryDir, `memory_${uid}.json`);

    try {
        fs.writeFileSync(chatHistoryFile, JSON.stringify(chatHistory, null, 2));
    } catch (error) {
        logError(`[Mistral] Error saving chat history for ${uid}: ${error.message}`);
    }
}

function setupReplyHandler(messageId, userNumber, threadID) {
    global.Luna.onReply.set(messageId, {
        callback: async ({ sock, m, sender, messageInfo }) => {
            try {
                const replyText = messageInfo.messageText || messageInfo.text || m.message?.conversation || m.message?.extendedTextMessage?.text;

                if (!replyText || replyText.trim() === '') {
                    logWarning(`[Mistral] Empty reply text from ${userNumber}`);
                    return;
                }

                logInfo(`[Mistral] Processing reply from ${userNumber}: ${replyText.substring(0, 50)}...`);

                // Handle clear in reply
                if (replyText.toLowerCase() === 'clear') {
                    clearChatHistory(userNumber);
                    return sock.sendMessage(threadID, { 
                        text: '🗑️ Chat history cleared successfully!' 
                    }, { quoted: m });
                }

                // Send typing indicator
                await sock.sendPresenceUpdate('composing', threadID);

                // Add processing reaction
                try {
                    await sock.sendMessage(threadID, {
                        react: { text: '⏳', key: m.key }
                    });
                } catch (e) {
                    // Ignore reaction errors
                }

                const replyStartTime = Date.now();

                try {
                    let replyHistory = loadChatHistory(userNumber);

                    const replyMessages = [
                        { "role": "system", "content": systemPrompt },
                        ...replyHistory,
                        { "role": "user", "content": replyText }
                    ];

                    const replyCompletion = await sendMistralRequest(replyMessages);
                    const replyResponse = replyCompletion.choices[0].message.content;

                    const replyEndTime = Date.now();
                    const replyCompletionTime = ((replyEndTime - replyStartTime) / 1000).toFixed(2);
                    const replyWords = replyResponse.split(/\s+/).filter(word => word !== '').length;

                    let replyMessage = `${replyResponse}`;
                    replyMessage += `\n⏱️ ${replyCompletionTime}s • 📝 ${replyWords} words`;

                    const newSentMessage = await sock.sendMessage(threadID, { 
                        text: replyMessage 
                    }, { quoted: m });

                    // Update history
                    replyHistory.push({ role: "user", content: replyText });
                    replyHistory.push({ role: "assistant", content: replyResponse });

                    if (replyHistory.length > 20) {
                        replyHistory = replyHistory.slice(-20);
                    }

                    appendToChatHistory(userNumber, replyHistory);

                    // Set up new reply handler for the new message
                    if (newSentMessage && newSentMessage.key && newSentMessage.key.id) {
                        setupReplyHandler(newSentMessage.key.id, userNumber, threadID);
                    }

                    // Add success reaction
                    try {
                        await sock.sendMessage(threadID, {
                            react: { text: '✅', key: m.key }
                        });
                    } catch (e) {
                        // Ignore reaction errors
                    }

                    logSuccess(`[Mistral] Reply processed successfully for ${userNumber}`);

                } catch (error) {
                    logError(`[Mistral] Reply API error: ${error.message}`);

                    try {
                        await sock.sendMessage(threadID, {
                            react: { text: '❌', key: m.key }
                        });
                    } catch (e) {
                        // Ignore reaction errors
                    }

                    let errorMessage = '❌ Sorry, there was an error processing your reply.';

                    if (error.response) {
                        if (error.response.status === 401) {
                            errorMessage = '❌ API key authentication failed.';
                        } else if (error.response.status === 429) {
                            errorMessage = '❌ Rate limit exceeded. Please try again later.';
                        } else if (error.response.status === 500) {
                            errorMessage = '❌ Server error. Please try again later.';
                        }
                    }

                    return sock.sendMessage(threadID, { 
                        text: errorMessage 
                    }, { quoted: m });
                }

            } catch (error) {
                logError(`[Mistral] Reply handler error: ${error.message}`);
                return sock.sendMessage(threadID, { 
                    text: '❌ An unexpected error occurred processing your reply.' 
                }, { quoted: m });
            }
        },
        oneTime: false
    });
}

/**
 * Clear chat history for user
 */
function clearChatHistory(uid) {
    const chatHistoryFile = path.join(chatHistoryDir, `memory_${uid}.json`);

    try {
        if (fs.existsSync(chatHistoryFile)) {
            fs.unlinkSync(chatHistoryFile);
            logInfo(`[Mistral] Chat history cleared for ${uid}`);
        }
    } catch (error) {
        logError(`[Mistral] Error clearing chat history for ${uid}: ${error.message}`);
    }
}