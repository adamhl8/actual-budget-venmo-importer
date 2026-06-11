import type { VenmoStory, VenmoUser } from "../venmo/types.ts";
import type { ActualTransaction } from "./client.ts";

function signedAmountCents(story: VenmoStory, meId: string): number {
	const payment = requirePayment(story);
	const cents = Math.round(payment.amount * 100);
	const iAmActor = payment.actor.id === meId;
	if (!iAmActor && payment.target.user.id !== meId)
		throw new Error(`Story ${story.id} involves neither party as me (${meId})`);

	// The actor initiated the story, not necessarily sent the money: "pay" flows
	// actor -> target, "charge" flows target -> actor.
	let outflow = payment.action === "charge" ? !iAmActor : iAmActor;
	if (story.type === "refund") outflow = !outflow;
	return outflow ? -cents : cents;
}

function payeeNameForStory(story: VenmoStory, meId: string): string {
	const payment = requirePayment(story);
	const other = payment.actor.id === meId ? payment.target.user : payment.actor;
	return userDisplayName(other);
}

function userDisplayName(user: VenmoUser): string {
	const candidates: (string | undefined)[] = [
		user.display_name,
		[user.first_name, user.last_name].filter(Boolean).join(" ").trim(),
		user.username,
	];
	for (const c of candidates) {
		if (c && c.trim().length > 0) return c.trim();
	}
	return "Unknown Venmo Payee";
}

function isoToActualDate(iso: string): string {
	return iso.slice(0, 10);
}

export function storyToTransaction(
	story: VenmoStory,
	meId: string,
	accountId: string,
): ActualTransaction {
	const payment = requirePayment(story);
	const dateSource = payment.date_completed ?? story.date_created;
	const noteRaw = (payment.note ?? story.note ?? "").trim();
	const tx: ActualTransaction = {
		account: accountId,
		date: isoToActualDate(dateSource),
		amount: signedAmountCents(story, meId),
		payee_name: payeeNameForStory(story, meId),
		imported_id: story.id,
		cleared: payment.status === "settled",
	};
	if (noteRaw.length > 0) tx.notes = noteRaw;
	return tx;
}

function requirePayment(story: VenmoStory) {
	if (!story.payment) {
		throw new Error(
			`Story ${story.id} (type=${story.type}) has no payment object`,
		);
	}
	return story.payment;
}
