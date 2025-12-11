package main

import (
	"context"
	"fmt"
	"github.com/neo4j/neo4j-go-driver/v6/neo4j"
)

func main() {

	dbUser := ""
	dbPassword := ""
	dbUri := "bolt://localhost:7687"
	driver, err := neo4j.NewDriver(dbUri, neo4j.BasicAuth(dbUser, dbPassword, ""))
	ctx := context.Background()
	defer driver.Close(ctx)

	err = driver.VerifyConnectivity(ctx)
	if err != nil {
		panic(err)
	} else {
		fmt.Println("Viola! Connected to Memgraph!")
	}

	//Create indexes on developer and technology nodes
	indexes := []string{
		"CREATE INDEX ON :Developer(id);",
		"CREATE INDEX ON :Technology(id);",
		"CREATE INDEX ON :Developer(name);",
		"CREATE INDEX ON :Technology(name);",
	}

	//Create developer nodes
	developer_nodes := []string{
		"CREATE (n:Developer {id: 1, name:'Andy'});",
		"CREATE (n:Developer {id: 2, name:'John'});",
		"CREATE (n:Developer {id: 3, name:'Michael'});",
	}

	//Create technology nodes
	technology_nodes := []string{
		"CREATE (n:Technology {id: 1, name:'Memgraph', description: 'Fastest graph DB in the world!', createdAt: Date()})",
		"CREATE (n:Technology {id: 2, name:'Go', description: 'Go programming language ', createdAt: Date()})",
		"CREATE (n:Technology {id: 3, name:'Docker', description: 'Docker containerization engine', createdAt: Date()})",
		"CREATE (n:Technology {id: 4, name:'Kubernetes', description: 'Kubernetes container orchestration engine', createdAt: Date()})",
		"CREATE (n:Technology {id: 5, name:'Python', description: 'Python programming language', createdAt: Date()})",
	}

	//Create relationships between developers and technologies
	relationships := []string{
		"MATCH (a:Developer {id: 1}),(b:Technology {id: 1}) CREATE (a)-[r:LOVES]->(b);",
		"MATCH (a:Developer {id: 2}),(b:Technology {id: 3}) CREATE (a)-[r:LOVES]->(b);",
		"MATCH (a:Developer {id: 3}),(b:Technology {id: 1}) CREATE (a)-[r:LOVES]->(b);",
		"MATCH (a:Developer {id: 1}),(b:Technology {id: 5}) CREATE (a)-[r:LOVES]->(b);",
		"MATCH (a:Developer {id: 2}),(b:Technology {id: 2}) CREATE (a)-[r:LOVES]->(b);",
		"MATCH (a:Developer {id: 3}),(b:Technology {id: 4}) CREATE (a)-[r:LOVES]->(b);",
	}

	//Create a simple session
	session := driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: ""})
	defer session.Close(ctx)

	// Run index queries via implicit auto-commit transaction
	for _, index := range indexes {
		_, err = session.Run(ctx, index, nil)
		if err != nil {
			panic(err)
		}
	}
	fmt.Println("****** Indexes created *******")

	// Run developer node queries
	for _, node := range developer_nodes {
		_, err = neo4j.ExecuteQuery(ctx, driver, node, nil, neo4j.EagerResultTransformer, neo4j.ExecuteQueryWithDatabase(""))
		if err != nil {
			panic(err)
		}
	}
	fmt.Println("****** Developer nodes created *******")

	// Run technology node queries
	for _, node := range technology_nodes {
		_, err = neo4j.ExecuteQuery(ctx, driver, node, nil, neo4j.EagerResultTransformer, neo4j.ExecuteQueryWithDatabase(""))
		if err != nil {
			panic(err)
		}
	}
	fmt.Println("****** Technology nodes created *******")

	// Run relationship queries
	for _, rel := range relationships {
		_, err = neo4j.ExecuteQuery(ctx, driver, rel, nil, neo4j.EagerResultTransformer, neo4j.ExecuteQueryWithDatabase(""))
		if err != nil {
			panic(err)
		}
	}
	fmt.Println("****** Relationships created *******")

	// Read a node
	query := "MATCH (n:Technology{name: 'Memgraph'}) RETURN n;"
	result, err := neo4j.ExecuteQuery(ctx, driver, query, nil, neo4j.EagerResultTransformer, neo4j.ExecuteQueryWithDatabase(""))
	if err != nil {
		panic(err)
	}

	// Print the node results
	for _, node := range result.Records {
		fmt.Println(node.AsMap()["n"].(neo4j.Node))                                        // Node type
		fmt.Println(node.AsMap()["n"].(neo4j.Node).GetProperties())                        // Node properties
		fmt.Println(node.AsMap()["n"].(neo4j.Node).GetElementId())                         // Node internal ID
		fmt.Println(node.AsMap()["n"].(neo4j.Node).Labels)                                 // Node labels
		fmt.Println(node.AsMap()["n"].(neo4j.Node).Props["id"].(int64))                    // Node user defined id property
		fmt.Println(node.AsMap()["n"].(neo4j.Node).Props["name"].(string))                 // Node user defined name property
		fmt.Println(node.AsMap()["n"].(neo4j.Node).Props["description"].(string))          // Node user defined description property
		fmt.Println(node.AsMap()["n"].(neo4j.Node).Props["createdAt"].(neo4j.Date).Time()) // Node user defined createdAt property

	}
	fmt.Println("****** End *******")
}
