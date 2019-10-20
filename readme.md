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
$ A=$(kv-swarm id -d /tmp/a)
$ B=$(kv-swarm id -d /tmp/b)
$ C=$(kv-swarm id -d /tmp/c)
$ X=$(kv-swarm id -d /tmp/x)
$ Y=$(kv-swarm id -d /tmp/y)
$ kv-swarm init --storage=$A:5,$B:10,$C:7 --writers=$X,$Y > config.json
$ kv-swarm listen -d /tmp/a -c config.json &
$ kv-swarm listen -d /tmp/b -c config.json &
$ kv-swarm listen -d /tmp/c -c config.json &
```

Once all the nodes are setup, you can write documents from nodes X and Y:

```
$ kv-swarm -d /tmp/x put greeting hi
$ kv-swarm -d /tmp/y put cool beans
```

and any node can read from the database:

```
$ kv-swarm get cool
beans
```

## api example

``` js
```

