"""Historical supply-chain disruption events.

Each event was checked on 2026-09-24 against primary pages: when the news
first became public (to the minute where possible), the first regular US
session after it, that the origin company was actually disrupted, and that
each downstream name's dependence on the origin was documented BEFORE the
event. Events or names that failed any of those checks were removed; they are
listed in DROPPED with the reason, so the sample's shrinkage is visible.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Event:
    name: str
    date: str  # YYYY-MM-DD, first regular US session after the news became public
    origin: str  # graph node id of the disrupted company
    downstream: list[str] = field(default_factory=list)  # tickers to test
    note: str = ""
    sources: list[str] = field(default_factory=list)


EVENTS: list[Event] = [
    Event(
        name="Hualien M7.4 earthquake",
        date="2024-04-03",
        origin="TSMC",
        downstream=["NVDA", "AAPL", "AMD", "QCOM", "AVGO"],
        note=(
            "Struck 2024-04-02 23:58 UTC, after the US close. TSMC evacuated fabs; "
            "over 70% of tools recovered within 10 hours. Each name's reliance on "
            "TSMC is in its annual report or Apple's supplier list, filed before "
            "the quake. NVIDIA later said it expected no supply impact."
        ),
        sources=[
            "https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=us7000m9g4&format=geojson",
            "https://www.sec.gov/Archives/edgar/data/1046179/000104617924000034/a20240403.htm",
            "https://focustaiwan.tw/business/202404030010",
            "https://9to5mac.com/2024/04/03/tsmc-plants-evacuated-earthquake/",
        ],
    ),
    Event(
        name="Foxconn Zhengzhou COVID lockdown and worker exodus",
        date="2022-10-31",
        origin="FOXCONN",
        downstream=["AAPL"],
        note=(
            "Reuters first reported workers fleeing on Sunday 2022-10-30 07:01 UTC, "
            "so the first session is Monday 10-31 (previously dated 11-02). Apple "
            "confirmed on 11-06 that its primary iPhone 14 Pro plant was impacted."
        ),
        sources=[
            "https://web.archive.org/web/20230829224826/https://www.reuters.com/world/china/chinese-cities-brace-wave-foxconn-workers-covid-hit-zhengzhou-2022-10-30/",
            "https://www.apple.com/newsroom/2022/11/update-on-supply-of-iphone-14-pro-and-iphone-14-pro-max/",
        ],
    ),
    Event(
        name="Texas winter storm Uri shuts Samsung Austin",
        date="2021-02-17",
        origin="SAMSUNG",
        downstream=["QCOM"],
        note=(
            "The shutdown was first reported 2021-02-16 22:41 UTC, after the close, "
            "so the first session is 02-17 (previously dated 02-16). TrendForce "
            "names Qualcomm 5G RF chips as Austin Line S2's main output. NVIDIA was "
            "removed: no source ties it to the Austin fab."
        ),
        sources=[
            "https://www.statesman.com/story/news/2021/02/16/austin-energy-shuts-power-off-samsung-other-major-users/6771267002/",
            "https://www.trendforce.com/presscenter/news/20210219-10669.html",
        ],
    ),
]

# Removed after checking, with the reason. Kept so the change is auditable.
DROPPED: list[tuple[str, str, str]] = [
    (
        "Taiwan M6.9 earthquake (Taitung)", "2022-09-19",
        "No source reports any TSMC production loss; only a precautionary staff "
        "evacuation. Using it would put a disruption that did not happen into the test.",
    ),
    (
        "Ever Given blocks the Suez Canal", "2021-03-24",
        "The ship was operated by Evergreen, not Maersk, and no source links Apple "
        "or Dell to the blockage.",
    ),
    (
        "Renesas Naka fab fire", "2021-03-22",
        "Renesas is not in the graph (Sony was a stand-in origin), and no source "
        "links Tesla to Renesas or the Naka line.",
    ),
]
