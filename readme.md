# kv-swarm

spread a key/value store across multiple nodes (horizontal partitioning)

Provide a key/value store such as leveldb or hypertrie and spread the storage
across a set of runtime-adjustable nodes with heterogeneous capacity and tunable
redundancy.

# example

## command-line example

In this example, we initialize a swarm with 3 storage nodes (A, B, and C)
and authorize nodes X and Y for writing to the swarm.

```
$ A=$(kvswarm id -d /tmp/a)
$ B=$(kvswarm id -d /tmp/b)
$ C=$(kvswarm id -d /tmp/c)
$ X=$(kvswarm id -d /tmp/x)
$ Y=$(kvswarm id -d /tmp/y)
$ kvswarm init --capacity.$A=5 --capacity.$B=10 --capacity.$C=7 --writer=$X --writer=$Y > config.json
$ kvswarm listen -d /tmp/a -c config.json &
$ kvswarm listen -d /tmp/b -c config.json &
$ kvswarm listen -d /tmp/c -c config.json &
```

Once all the nodes are setup, you can write documents from nodes X and Y:

```
$ kv-swarm -c config.json -d /tmp/x write --put.greeting=hi
$ kv-swarm -c config.json -d /tmp/y write --put.cool=beans
$ kv-swarm -c config.json -d /tmp/x connect &
$ kv-swarm -c config.json -d /tmp/y connect &
```

and any node can read from the database:

```
$ kv-swarm -c config.json -d /tmp/x get cool
beans
```

## api example

``` js
```

