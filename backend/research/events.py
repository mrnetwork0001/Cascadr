"""Historical supply-chain disruption events.

Dates are the first US trading session on or after the news broke, taken from
public reporting. They are approximate to the day — verify any event before
drawing a conclusion from it alone. The value is in the cross-section, not in
any single row.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Event:
    name: str
    date: str  # YYYY-MM-DD, first US session on/after the news
    origin: str  # graph node id of the disrupted entity
    downstream: list[str] = field(default_factory=list)  # tickers to test
    note: str = ""


EVENTS: list[Event] = [
    Event(
        name="Hualien M7.4 earthquake",
        date="2024-04-03",
        origin="TSMC",
        downstream=["NVDA", "AAPL", "AMD", "QCOM", "AVGO"],
        note="Taiwan's strongest quake in 25y; TSMC evacuated fabs, halted some lines.",
    ),
    Event(
        name="Taiwan M6.9 earthquake",
        date="2022-09-19",
        origin="TSMC",
        downstream=["NVDA", "AAPL", "AMD", "QCOM", "AVGO"],
        note="Taitung quake; limited fab impact — a useful near-null control.",
    ),
    Event(
        name="Foxconn Zhengzhou lockdown",
        date="2022-11-02",
        origin="FOXCONN",
        downstream=["AAPL"],
        note="Worker exodus from 'iPhone City' ahead of peak build.",
    ),
    Event(
        name="Ever Given blocks Suez",
        date="2021-03-24",
        origin="MAERSK",
        downstream=["AAPL", "DELL"],
        note="Canal blocked six days; global container freight disrupted.",
    ),
    Event(
        name="Texas winter storm Uri",
        date="2021-02-16",
        origin="SAMSUNG",
        downstream=["QCOM", "NVDA"],
        note="Austin fabs (Samsung, NXP, Infineon) lost power for weeks.",
    ),
    Event(
        name="Renesas Naka fab fire",
        date="2021-03-22",
        origin="SONY",
        downstream=["TSLA"],
        note="Automotive MCU supply shock; proxy origin, Renesas is not a graph node.",
    ),
]
