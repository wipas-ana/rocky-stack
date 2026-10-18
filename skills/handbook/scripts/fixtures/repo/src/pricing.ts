export function applyDiscount(total: number, code: string): number {
	if (code === "WELCOME10" && total >= 50) return total * 0.9;
	return total;
}
