/** Thin inter-bot bus (P3.B1–B4) — public surface. */
export { MESSAGE_TYPES, LIFECYCLE, TERMINAL, canTransition, hasEvidence } from './types.mjs';
export { accept, listOnline } from './accept.mjs';
export { sendMessage, getMessage, updateMessageStatus } from './messages.mjs';
export { requestTask, updateTask, cancelTask, getTask } from './tasks.mjs';
export { wakeRequest } from './wake.mjs';
export { beat, checkPresence } from '../daemon/presence.mjs';
