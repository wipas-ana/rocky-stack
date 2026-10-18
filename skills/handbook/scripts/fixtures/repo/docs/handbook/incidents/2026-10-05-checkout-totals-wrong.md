# Checkout charged full price for WELCOME10

**Severity.** P2
**What happened.** For two hours, carts with WELCOME10 paid full price.
**Cause.** The code check compared the wrong case in `src/pricing.ts#applyDiscount`.
**Fix.** https://github.com/example/shop/pull/14
**Guard.** `tests/test_pricing.py#test_welcome_discount_needs_minimum_total`
**Follow-ups.** None.
