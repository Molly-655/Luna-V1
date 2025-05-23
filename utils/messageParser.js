

/**
 * Extracts text content from a WhatsApp message object
 * @param {Object} message - The message object from WhatsApp
 * @returns {String} - The extracted text content or empty string if no text
 */
function getTextContent(message) {
    if (!message) return '';

    try {
        // Extract text based on message type
        if (message.conversation) return message.conversation;
        if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
        if (message.imageMessage?.caption) return message.imageMessage.caption;
        if (message.videoMessage?.caption) return message.videoMessage.caption;
        if (message.documentMessage?.caption) return message.documentMessage.caption;
        if (message.documentWithCaptionMessage?.message?.documentMessage?.caption) 
            return message.documentWithCaptionMessage.message.documentMessage.caption;
        if (message.viewOnceMessage?.message) 
            return getTextContent(message.viewOnceMessage.message);
        if (message.viewOnceMessageV2?.message) 
            return getTextContent(message.viewOnceMessageV2.message);
        if (message.templateButtonReplyMessage?.selectedDisplayText) 
            return message.templateButtonReplyMessage.selectedDisplayText;
        if (message.buttonsResponseMessage?.selectedDisplayText) 
            return message.buttonsResponseMessage.selectedDisplayText;
        if (message.listResponseMessage?.title) 
            return message.listResponseMessage.title;
    } catch (error) {
        console.error(`Error extracting text content: ${error.message}`);
    }

    return '';
}

/**
 * Gets the name of a message sender
 * @param {Object} sock - The WhatsApp socket connection
 * @param {String} jid - The WhatsApp ID (JID) of the sender
 * @returns {String} - The sender's name or phone number
 */
async function getSenderName(sock, jid) {
    if (!jid) return 'Unknown';

    try {
        // Remove any suffix from JID to get just the phone number
        const number = jid.split('@')[0];

        // Try to get contact info from sock
        const contact = await sock.contactsStore?.contacts[jid];
        if (contact?.name || contact?.notify) {
            return contact.name || contact.notify;
        }

        // If no contact info is available, return the number
        return number;
    } catch (error) {
        console.error(`Error getting sender name: ${error.message}`);
        return jid.split('@')[0]; // Fallback to returning just the number
    }
}

module.exports = {
    getTextContent,
    getSenderName
};