module.exports = {
  name: 'kick',
  description: 'Kick a user from the group',
  permission: 1, groupOnly: true,

run: async ({ sock, m, args, messageInfo }) => { const groupId = m.key.remoteJid;

// Step 1: Get the number or mentioned JID
let userToKick;

if (messageInfo.mentionedJid && messageInfo.mentionedJid.length > 0) {
  userToKick = messageInfo.mentionedJid[0];
} else if (args[0]) {
  const cleanNumber = args[0].replace(/[^0-9]/g, '');
  userToKick = `${cleanNumber}@s.whatsapp.net`;
}

if (!userToKick) {
  return sock.sendMessage(groupId, {
    text: 'Please mention or type a valid number to kick.'
  }, { quoted: m });
}

try {
  const response = await sock.groupParticipantsUpdate(groupId, [userToKick], 'remove');

  const status = response?.[0]?.status;

  if (status === 200) {
    await sock.sendMessage(groupId, {
      text: `User kicked: @${userToKick.split('@')[0]}`,
      mentions: [userToKick]
    }, { quoted: m });
  } else if (status === 403) {
    await sock.sendMessage(groupId, {
      text: 'Cannot remove user — insufficient permissions or privacy restrictions.'
    }, { quoted: m });
  } else {
    await sock.sendMessage(groupId, {
      text: `Failed to remove user (status: ${status}).`
    }, { quoted: m });
  }
} catch (err) {
  console.error(err);
  await sock.sendMessage(groupId, {
    text: 'An error occurred while trying to kick the user.'
  }, { quoted: m });
}

} };

