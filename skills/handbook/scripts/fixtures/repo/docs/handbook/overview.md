# What the shop does

The shop prices a cart in `src/pricing.ts#applyDiscount` before checkout.

```mermaid
flowchart LR
	Cart --> Pricing --> Checkout
```
