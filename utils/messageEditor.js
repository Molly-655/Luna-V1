
async function editMessage(sock, jid, text, key) {
    try {
        return await sock.sendMessage(jid, {
            text: text,
            edit: {
                key: {
                    remoteJid: jid,
                    id: key.id,
                    fromMe: true
                }
            }
        });
    } catch (error) {
        console.error("Error editing message:", error);
        throw error;
    }
}

async function editMessageFallback(sock, jid, text, key) {
    try {
        return await sock.sendMessage(jid, {
            text: text,
            quoted: { key: key }
        });
    } catch (error) {
        console.error("Error with edit fallback:", error);
        throw error;
    }
}

module.exports = {
    editMessage,
    editMessageFallback
};