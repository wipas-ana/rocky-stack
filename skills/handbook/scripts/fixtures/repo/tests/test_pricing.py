def test_welcome_discount_needs_minimum_total():
	assert apply_discount(49, "WELCOME10") == 49
