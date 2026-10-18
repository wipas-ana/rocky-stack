# Pricing rules

- The WELCOME10 code takes 10% off carts of 50 or more. Code `src/pricing.ts#applyDiscount`. Guard `tests/test_pricing.py#test_welcome_discount_needs_minimum_total`.
- Other codes change nothing. Code `src/pricing.ts#return total`. `unguarded`.
