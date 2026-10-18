# WELCOME10 discounted a 49 cart

**Symptom.** A 49 cart got 10% off.
**Keywords.** discount, WELCOME10, minimum
**Root cause.** The minimum check was missing in `src/pricing.ts#applyDiscount`.
**Fix.** https://github.com/example/shop/pull/12
**Guard.** `tests/test_pricing.py#test_welcome_discount_needs_minimum_total`
