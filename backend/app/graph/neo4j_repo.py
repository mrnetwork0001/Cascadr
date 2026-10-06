"""Neo4j-backed graph.

Imported lazily by app.main so the `neo4j` package stays an optional
dependency - the service runs on the in-memory repository without it.
"""

from app.models import GraphEdge, GraphNode, Provenance, Tier

NODE_QUERY = """
MATCH (c:Company)
RETURN c.id AS id, c.name AS name, c.tier AS tier, c.country AS country,
       c.revenueB AS revenue_b, c.ticker AS ticker
"""

EDGE_QUERY = """
MATCH (a:Company)-[r]->(b:Company)
RETURN a.id AS source, b.id AS target, type(r) AS relation,
       r.component AS component, r.dependency AS dependency,
       r.provenance AS provenance, r.citation AS citation
"""

SCHEMA = """
CREATE CONSTRAINT company_id IF NOT EXISTS
FOR (c:Company) REQUIRE c.id IS UNIQUE
"""


class Neo4jGraphRepository:
    backend = "neo4j"

    def __init__(self, uri: str, user: str, password: str):
        from neo4j import AsyncGraphDatabase

        self._driver = AsyncGraphDatabase.driver(uri, auth=(user, password))

    async def aclose(self) -> None:
        await self._driver.close()

    async def verify(self) -> None:
        await self._driver.verify_connectivity()

    async def nodes(self) -> list[GraphNode]:
        async with self._driver.session() as s:
            result = await s.run(NODE_QUERY)
            return [
                GraphNode(
                    id=r["id"],
                    name=r["name"],
                    tier=Tier(r["tier"]),
                    country=r["country"] or "??",
                    revenue_b=float(r["revenue_b"] or 0.0),
                    ticker=r["ticker"],
                )
                async for r in result
            ]

    async def edges(self) -> list[GraphEdge]:
        async with self._driver.session() as s:
            result = await s.run(EDGE_QUERY)
            return [
                GraphEdge(
                    source=r["source"],
                    target=r["target"],
                    relation=r["relation"],
                    component=r["component"] or "unspecified",
                    dependency=float(r["dependency"] or 0.0),
                    provenance=Provenance(r["provenance"] or "ESTIMATED"),
                    citation=r["citation"],
                )
                async for r in result
            ]
