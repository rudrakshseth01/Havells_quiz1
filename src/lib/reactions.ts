export const LOBBY_EMOJIS = ['🔥', '😂', '🚀', '😭', '💀', '⚡', '👑', '🎯'] as const;

export type LobbyEmoji = (typeof LOBBY_EMOJIS)[number];
