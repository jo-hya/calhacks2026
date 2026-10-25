import { randomUUID } from 'node:crypto';
import { getBudgets, money, proposeTransfer, confirmTransfer } from '../src/lib/budget.js';

export const INVITATION = 'Friends: Dinner tonight? $55 each. Can I fit this in my budget?';
// A deterministic stand-in for the teammate's agent. Every number comes from state.
export function respond(data, text, channel = 'simulation') {
  const command = text.trim().toUpperCase();
  let reply;
  let state = data.state;
  let proposal = data.proposals[channel];
  const dining = () => getBudgets(state).find(b => b.id === 'dining').remaining;
  if (command === 'CANCEL' || command === 'KEEP') {
    proposal = null;
    reply = 'Kept your budget unchanged. Text DINNER to try again.';
  } else if (command.startsWith('YES ')) {
    if (!proposal || command !== `YES ${proposal.code}`) reply = 'No matching pending transfer. Text DINNER for a fresh review.';
    else {
      try {
        state = confirmTransfer(state, proposal);
        const clothing = getBudgets(state).find(b => b.id === 'shopping').remaining;
        reply = `Moved $20 to Dining. Dining: ${money(dining())}. Clothing: ${money(clothing)}. Budget only; no bank payment.`;
        proposal = null;
      } catch { proposal = null; reply = 'Your review expired or your budget changed. Text DINNER for a fresh review.'; }
    }
  } else if (command === 'DINNER' || text === INVITATION || (/\bdinner\b/i.test(text) && /\$55\b/.test(text))) {
    const shortfall = Math.max(0, 5500 - dining());
    if (!shortfall) { proposal = null; reply = `Dining has ${money(dining())}; the $55 dinner fits. No budget change needed.`; }
    else if (shortfall > 2000) { proposal = null; reply = `Dining has ${money(dining())}; dinner is ${money(shortfall)} over. A $20 move is not enough. Consider a cheaper plan.`; }
    else {
      try {
        proposal = { ...proposeTransfer(state, { from: 'shopping', to: 'dining', amountCents: 2000, id: randomUUID() }), code: randomUUID().slice(0, 6).toUpperCase() };
        reply = `Dining: ${money(dining())}. $55 dinner is ${money(shortfall)} over. Move $20 Clothing to Dining? Reply YES ${proposal.code} or CANCEL.`;
      } catch { proposal = null; reply = 'Clothing has less than $20 available. Keep your budget and choose a cheaper dinner.'; }
    }
  } else reply = 'Scripted demo: send DINNER for the $55 invitation, then use the exact YES code in the review, or CANCEL.';
  return { ...data, state, proposals: { ...data.proposals, [channel]: proposal }, messages: [...data.messages, { who: 'You', text, channel, at: new Date().toISOString() }, { who: 'Lila (scripted)', text: reply, channel, at: new Date().toISOString() }].slice(-100), reply };
}
