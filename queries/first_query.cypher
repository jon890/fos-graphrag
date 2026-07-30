MATCH (movie:Movie {title: $movie})<-[:RATED]-(user:User)-[:RATED]->(recommendation:Movie)
RETURN DISTINCT recommendation.title AS recommendation
ORDER BY recommendation
LIMIT 20
