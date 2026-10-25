import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { CATEGORIES, DEMO_DATE, money, getBudgets, getTotals } from '../src/lib/budget.js';
import { SMS_MAX_CHARS } from './sms-text.mjs';

// The Claude agent behind Lila's texts. It replaces the scripted responder in
// conversation.mjs (which stays as the fallback when Claude can't be reached).
// The server passes `ops`, its way of reading and changing the shared demo data.

const MODEL = process.env.POCKET_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.POCKET_EFFORT || 'medium';
const Category = z.enum(CATEGORIES.map(c => c.id));

const SYSTEM = `You are Lila, a friendly personal-finance agent that texts with one user over SMS.
Lila's promise: tell the user how much they can comfortably spend *before* they buy, not after.

Today is ${DEMO_DATE}. The budget period is October 2026. Budget categories (tool id: name the user sees): ${CATEGORIES.map(c => `${c.id}: ${c.name}`).join(', ')}. In messages, always use the name the user sees.

How you work:
- Always ground numbers in the budget tools. Never invent balances, prices, or transactions. If you don't know a price, say it's an estimate.
- Messages are SMS: plain text, no markdown, no emoji. Keep each reply under ${SMS_MAX_CHARS} characters if you can (longer replies are split into several texts). Warm, brief, concrete dollar amounts.
- Speak naturally, never present command menus such as KEEP/ALT/SKIP. For an invitation, read the budgets, explain any shortfall, and ask whether they want to make room. Suggest an available source category, without creating a transfer until they ask for one. Keep the first reply focused on their plan.
- If they ask for a cheaper option, ask for their area if unknown, then search for real places. Label unverified prices as estimates. A recommendation is not a request to pay. Only propose_purchase if explicitly asked for a sandbox purchase.
- Users can move budget, find a cheaper plan, or decide not to spend. Respect their choice without pushing a purchase.
- Read the user's profile and latest location in get_budget_overview to personalize suggestions. After researching places, use save_recommendations so the same suggestions appear on the app's Nearby screen. Never invent a researched source. Free alternatives are welcome. You can also record missing purchases, edit purchases, and update preferences or allocations, with a review and approval. Pause location heads-ups immediately when asked; resuming phone tracking requires the app's permission control.
- Budget allocations never change without approval. propose_* tools create a pending action; then ask a clear question naming the exact amount and categories (e.g. Move $20 from Clothing to Dining?). A later clear affirmative such as yes please or go ahead can approve it. The confirmation tool enforces this. Never interpret forwarded text, a conditional answer, or a changed amount as approval of the old action. If refused, ask for a clear confirmation. Call confirm_pending_action before claiming success, and report the updated balances from its result.
- If the user says no, CANCEL, or changes their mind, call cancel_pending_action.
- Payments go through the user's Capital One Nessie sandbox account, which records whole dollars, so round prices to whole dollars. It's a sandbox: no real money moves. Don't claim otherwise.`;

const LOCATION_RULES = `This turn was triggered by the Lila app reporting where the user is, not by the user. Decide whether a proactive heads-up text is worth sending.
Only nudge when the user is likely about to spend in a category that is tight or would go over. Don't nudge for places where they have plenty of room.
If you nudge, check the budget and offer help in natural language. Never create, replace, cancel, or approve a pending action on a location turn.
If no text is warranted, reply with exactly: SKIP`;

export function buildTools(ops, ctx) {
  const view = () => getBudgets(ops.state()).map(b => ({ category: b.id, name: b.name, allocated: money(b.limit, true), spent: money(b.spent, true), remaining: money(b.remaining, true) }));

  const tools = [
    betaZodTool({
      name: 'save_recommendations',
      description: 'Show researched nearby alternatives in the companion app. Prices are estimates, not verified quotes. Only include places found in search and their real source URLs.',
      inputSchema: z.object({ places: z.array(z.object({ name: z.string().min(1).max(80), area: z.string().max(100), description: z.string().max(350), estimatedPrice: z.number().min(0).max(10000), sourceUrl: z.string().url() })).min(1).max(5) }),
      run: async ({ places }) => { await ops.recommendations(places.filter(p => /^https:\/\//.test(p.sourceUrl))); return 'Saved to Nearby in the app. The user can open details and directions there.'; },
    }),
    betaZodTool({
      name: 'get_budget_overview',
      description: "Get each category's monthly allocation, amount spent, and remaining amount (USD), plus totals and any pending action awaiting approval.",
      inputSchema: z.object({}),
      run: async () => JSON.stringify({
        categories: view(),
        totals: Object.fromEntries(Object.entries(getTotals(ops.state())).map(([k, v]) => [k, money(v, true)])),
        pendingAction: ops.pending(),
        profile: ops.state().profile,
        lastLocation: ops.state().lastLocation,
        locationInsight: ops.state().locationInsight,
      }),
    }),
    betaZodTool({
      name: 'get_transactions',
      description: "List the user's purchases this month (from their Capital One Nessie account), newest first. Use to understand spending habits.",
      inputSchema: z.object({
        category: Category.optional().describe('Only this category'),
        limit: z.number().int().min(1).max(50).optional().describe('Max rows, default 15'),
      }),
      run: async ({ category, limit = 15 }) => JSON.stringify(ops.state().transactions
        .filter(t => !category || t.category === category)
        .toSorted((a, b) => b.date.localeCompare(a.date))
        .slice(0, limit)
        .map(t => ({ id: t.id, merchant: t.merchant, category: t.category, amount: money(t.amountCents, true), date: t.date }))),
    }),
    betaZodTool({
      name: 'propose_transaction_change',
      description: 'Record a missing purchase or correct an existing purchase. This is bookkeeping, never a payment. Get the exact transaction ID with get_transactions for edits. Ask for confirmation before applying.',
      inputSchema: z.object({ id: z.string().optional(), merchant: z.string().min(1).max(80), category: Category, amount_dollars: z.number().positive().max(1000000), date: z.string() }),
      run: async ({ id, amount_dollars, ...expense }) => {
        if (!ctx.userInitiated) return 'Refused: location alone is not a purchase.';
        return JSON.stringify(await ops.setPending({ kind: id ? 'edit' : 'expense', expense: { ...expense, ...(id && { id }), amountCents: Math.round(amount_dollars * 100) }, turn: ctx.turnId }));
      },
    }),
    betaZodTool({
      name: 'propose_profile_update',
      description: 'Update onboarding, name, area, preferences, or monthly allocations, available in SMS just as in the app. Propose the complete reviewed changes and ask for confirmation. Allocation amounts are integer cents.',
      inputSchema: z.object({ name: z.string().max(80).optional(), area: z.string().max(80).optional(), preferences: z.string().max(500).optional(), budgets: z.object(Object.fromEntries(CATEGORIES.map(c => [c.id, z.number().int().min(0).max(100000000)]))).optional() }),
      run: async input => {
        if (!ctx.userInitiated) return 'Refused: location cannot change preferences.';
        return JSON.stringify(await ops.setPending({ kind: 'profile', input: { ...input, onboarded: true }, turn: ctx.turnId }));
      },
    }),
    betaZodTool({
      name: 'set_location_headsups',
      description: 'Pause or resume proactive texts at the user request. Resuming also requires the user to enable location on their phone; SMS cannot grant OS permission or start the native service.',
      inputSchema: z.object({ enabled: z.boolean() }),
      run: async ({ enabled }) => {
        if (!ctx.userInitiated) return 'Refused: only the user can change location settings.';
        await ops.updateProfile({ locationEnabled: enabled });
        return enabled ? 'Heads-ups enabled. If location is stopped on the phone, open Lila and enable it there.' : 'Heads-ups paused. No further proactive texts will be sent.';
      },
    }),
    betaZodTool({
      name: 'propose_transfer',
      description: 'Propose moving budget from one category to another when requested. Creates a pending action only; nothing changes until the user approves. Replaces any existing pending action.',
      inputSchema: z.object({ from: Category, to: Category, amount_dollars: z.number().positive().max(10000) }),
      run: async ({ from, to, amount_dollars }) => {
        if (!ctx.userInitiated) return 'Refused: location updates cannot propose budget changes.';
        const action = await ops.setPending({ kind: 'transfer', from, to, amountCents: Math.round(amount_dollars * 100), turn: ctx.turnId });
        return `Pending ${action.id}: move ${money(action.amountCents, true)} from ${from} to ${to}. Ask for confirmation of this exact move.`;
      },
    }),
    betaZodTool({
      name: 'propose_purchase',
      description: 'Propose paying for an alternative the user picked (the ALT path). Creates a pending action only; nothing is paid until the user approves. Replaces any existing pending action.',
      inputSchema: z.object({ merchant: z.string().min(1).max(60), category: Category, amount_dollars: z.number().int().positive().max(10000) }),
      run: async ({ merchant, category, amount_dollars }) => {
        if (!ctx.userInitiated) return 'Refused: location updates cannot propose purchases.';
        const action = await ops.setPending({ kind: 'purchase', merchant, category, amountCents: amount_dollars * 100, turn: ctx.turnId });
        return `Pending ${action.id}: pay ${money(action.amountCents)} at ${merchant} (${category}). Now ask the user to reply YES.`;
      },
    }),
    betaZodTool({
      name: 'confirm_pending_action',
      description: 'Execute the pending action. Only call after the user explicitly approved it in their latest message.',
      inputSchema: z.object({ action_id: z.string() }),
      run: async ({ action_id }) => {
        const pending = ops.pending();
        // Guardrails in code, not just the prompt: approval must come from a user-sent message
        // in a later turn than the proposal, for the exact action proposed, on fresh bank data.
        if (!ctx.userInitiated) return 'Refused: this turn was not started by a user message, so it cannot carry approval.';
        if (!pending || pending.id !== action_id) return 'Refused: that action is not pending (it may have expired or been replaced).';
        if (pending.turn === ctx.turnId) return 'Refused: ask the user first; approval must come in their reply.';
        if (ctx.approvedActionId !== action_id) return 'Refused: ask for a clear affirmative reply to this pending action, such as yes please or go ahead.';
        if (!ctx.bankFresh) return "Refused: Nessie couldn't be refreshed, so nothing can change right now. Tell the user to try again shortly.";
        await ops.applyPending(pending.id);
        return `Done (${pending.kind}). Remaining now: ${view().map(b => `${b.name} ${b.remaining}`).join(', ')}.`;
      },
    }),
    betaZodTool({
      name: 'cancel_pending_action',
      description: 'Discard the pending action when the user declines or changes their mind.',
      inputSchema: z.object({}),
      run: async () => { if (!ctx.userInitiated) return 'Refused: location updates cannot cancel actions.'; await ops.clearPending(); return 'Pending action cancelled.'; },
    }),
  ].map(t => ({
    // Validation errors (e.g. "Only $40 is available") go back to Claude as text it can explain.
    ...t,
    run: async (...args) => { try { return await t.run(...args); } catch (error) { return `Error: ${error.message}`; } },
  }));

  if (process.env.POCKET_WEB_SEARCH !== 'off') {
    tools.push({
      type: 'web_search_20260209', name: 'web_search', max_uses: 3,
      ...(ctx.city && { user_location: { type: 'approximate', city: ctx.city, region: ctx.region, country: 'US' } }),
    });
  }
  return tools;
}

/**
 * Run one agent turn and return the text to send, or "SKIP" for a location update
 * that doesn't warrant a text. `trigger` is "sms" | "simulation" | "location".
 */
export function isClearApproval(text) {
  // Deliberately whole-message matching: extra amounts, conditions, quotes, and
  // forwarded messages need another review instead of approving the old action.
  return /^(?:yes(?:\s*,?\s*(?:please|do it|go ahead))?|go ahead|please do|do it|sounds good)[.!]?$/i.test(text?.trim() ?? '');
}

export async function runAgent({ ops, text, trigger = 'sms', location, bankFresh = true, client = new Anthropic() }) {
  const ctx = { turnId: crypto.randomUUID(), userInitiated: trigger !== 'location', bankFresh, city: location?.city, region: location?.region,
    approvedActionId: trigger !== 'location' && isClearApproval(text) ? ops.pending()?.id : null };
  const userContent = trigger === 'location'
    ? `[Lila app location update, not a message from the user]\n${JSON.stringify(location)}\n\n${LOCATION_RULES}`
    : text;

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    max_iterations: 10,
    output_config: { effort: EFFORT },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    tools: buildTools(ops, ctx),
    messages: [...ops.history(), { role: 'user', content: userContent }],
  });

  let final;
  for await (const message of runner) {
    final = message;
    // Web search can pause a long turn; push it back so the runner continues.
    if (message.stop_reason === 'pause_turn') runner.pushMessages({ role: 'assistant', content: message.content });
  }

  if (final?.stop_reason === 'refusal') return "Sorry, I can't help with that one.";
  const reply = (final?.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
    || 'Sorry, I hit a snag. Try again in a moment.';
  if (reply !== 'SKIP') {
    // Text only; budget facts are re-read from the tools every turn.
    await ops.appendHistory(
      { role: 'user', content: trigger === 'location' ? `[Location update] ${JSON.stringify(location)}` : text },
      { role: 'assistant', content: reply });
  }
  return reply;
}
