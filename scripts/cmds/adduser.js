module.exports = {
    name: 'adduser',
    alias: ['add'],
    description: 'Add a user to the group',
    usage: '!adduser 919876543210',
    permission: 1, 
    cooldown: 5, 

    run: async ({ sock, m, args, isGroup }) => {
        const groupId = m.key.remoteJid;

        
        if (!isGroup) {
            return sock.sendMessage(groupId, { text: 'This command only works in groups.' }, { quoted: m });
        }

        
        if (!args[0]) {
            return sock.sendMessage(groupId, { text: 'Please provide the number to add.\nExample: !adduser 919876543210' }, { quoted: m });
        }

        let number = args[0].replace(/[^0-9]/g, '');
        if (!number.endsWith('@s.whatsapp.net')) {
            number = `${number}@s.whatsapp.net`;
        }

        try {
            const response = await sock.groupParticipantsUpdate(groupId, [number], 'add');

            const status = response?.[0]?.status;

            if (status === 200 || status === '200') {
                await sock.sendMessage(groupId, { text: `User added: wa.me/${number.replace(/@s\.whatsapp\.net$/, '')}` }, { quoted: m });
            } else if (status === 403) {
                await sock.sendMessage(groupId, { text: `Failed to add. User privacy settings may be blocking the invite.` }, { quoted: m });
            } else {
                await sock.sendMessage(groupId, { text: `Failed to add user. Status code: ${status}` }, { quoted: m });
            }
        } catch (err) {
            console.error('Error adding user:', err);
            await sock.sendMessage(groupId, { text: 'An error occurred while trying to add the user.' }, { quoted: m });
        }
    }
};