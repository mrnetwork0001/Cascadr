"""Paper broker tests — friction must be real enough to exercise exit logic."""

from app.market.paper import PaperBroker


def test_slippage_always_hurts_the_seller():
    f = PaperBroker(reject_rate=0, partial_rate=0).fill(
        client_oid="a", side="sell", size=10, mark=100.0
    )
    assert f.accepted and f.avg_price < 100.0


def test_slippage_always_hurts_the_buyer():
    f = PaperBroker(reject_rate=0, partial_rate=0).fill(
        client_oid="a", side="buy", size=10, mark=100.0
    )
    assert f.avg_price > 100.0


def test_bigger_orders_slip_more():
    b = PaperBroker(reject_rate=0, partial_rate=0)
    small = b.fill(client_oid="a", side="sell", size=10, mark=100.0)
    large = b.fill(client_oid="b", side="sell", size=1000, mark=100.0)
    assert large.slippage_bps > small.slippage_bps


def test_outcomes_are_deterministic():
    b = PaperBroker()
    a1 = b.fill(client_oid="x", side="sell", size=10, mark=100.0)
    a2 = b.fill(client_oid="x", side="sell", size=10, mark=100.0)
    assert (a1.accepted, a1.filled_size) == (a2.accepted, a2.filled_size)


def test_friction_can_be_disabled():
    f = PaperBroker(enabled=False).fill(
        client_oid="x", side="sell", size=10, mark=100.0
    )
    assert f.avg_price == 100.0 and f.complete


def test_rejects_and_partials_both_occur_across_many_orders():
    b = PaperBroker(reject_rate=0.05, partial_rate=0.15)
    fills = [
        b.fill(client_oid=f"o{i}", side="sell", size=10, mark=100.0)
        for i in range(400)
    ]
    assert any(not f.accepted for f in fills), "rejects must occur"
    assert any(f.partial for f in fills), "partial fills must occur"
