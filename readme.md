# kvswarm

key/value store split across multiple writer nodes (horizontal partitioning)
with p2p content distribution and networking

uses [random slicing][] to provide an address space that minimizes moves during
resizes and [peermq][] to provide robust delivery of messages with an offline
write log

[random slicing]: https://github.com/peermaps/random-slicing

# status

* [x] get/put across multiple nodes
* [x] hot-swap configuration
* [ ] move data after capacity adjustment
* [ ] mirror nodes
* [ ] redundancy balancing

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
$ kvswarm -c config.json -d /tmp/x write --put.greeting=hi
$ kvswarm -c config.json -d /tmp/y write --put.cool=beans
$ kvswarm -c config.json -d /tmp/x connect &
$ kvswarm -c config.json -d /tmp/y connect &
```

and any node can read from the database:

```
$ kvswarm -c config.json -d /tmp/x get cool
beans
$ kvswarm -c config.json -d /tmp/y get greeting
hi
```

# api

```
var kvswarm = require('kvswarm')
var Config = require('kvswarm/config')
```

## var kv = kvswarm(opts)

Create a new kvswarm instance from:

* `opts.network` - network interface (use `require('peermq/network')`)
* `opts.storage` - string that represents a base path OR a function that
    receives a string name argument and returns a random-access adaptor or a
    string path
* `opts.config` - `Config` instance to set writers and bin slicings
* `opts.bins` - object mapping node keys to slicing arrays
    (see the [random-slicing][] module for how these arrays are formatted)

## kv.get(key, opts, cb)

Get the value of a string `key` as `cb(err, value)`.

kvswarm is in sparse mode by default, so a `get()` will trigger a download for
the relevant key.

`opts` are passed through to hypercore's `get()` method.

## kv.put(key, value)

Append a PUT message to the write cache for `key` and `value`.

The write cache is ephemeral.

## kv.del(key)

Append a DEL message to the write cache for `key`.

The write cache is ephemeral.

## kv.flush(opts, cb)

Flush the write cache to the outgoing write logs that correspond to the address
space for each key. Less frequent, larger flushes will be faster to process, but the
data won't be saved to durable storage until it's written into a write block
with `flush()`.

* `opts.ack` - when true, wait for an acknowledgement that the write node
    received this
* `opts.receipt` - when true, wait until the write block associated with this flush was
    written, processed, and the hypercore update has propagated back so you can
    `get()` (implies `opts.ack`)

## kv.connect()

Connect to the network swarm.

## kv.disconnect()

Disconnect from the network swarm.

## kv.listen(cb)

Listen for incoming connections. Write and mirror nodes should call this
method.

## kv.setWriters(writers, cb)

Set the list of authorized writers as an array of hex string keys.

## kv.getWriters(cb)

Get an array of writer nodes by their hex string key as `cb(err, writers)`.

## kv.addWriter(key, cb)

Add a writer by its node key as a hex string.

## kv.removeWriter(key, cb)

Remove a writer by its node key as a hex string.

## kv.setCapacities(capacities)

Set the capacities of write nodes with an object mapping hex string ids to
unitless numeric capacities.

## kv.setConfig(config, cb)

Set the configuration for the kv to use at runtime.

## var config = new Config(opts)

Create a new configuration from:

* `opts.writers` - array of node keys authorized to write new messages
* `opts.capacities` - object mapping node keys to capacity values
    (unitless numeric values)

### var config = Config.parse(str)

Create a new configuration object from a string `str`.

## var str = config.serialize()

Create a string that can be stored on disk and fed to `Config.parse(str)` later.

### config.update(opts)

Update any of:

* `opts.capacities` - new capacities to use. uses existing slices to adjust.
* `opts.writers` - new set of writers as an array of hex string keys

## config.addWriter(key)

Add a writer by its hex string `key`

### config.removeWriter(key)

Remove a writer by its hex string `key`

# license

[license zero parity](https://licensezero.com/licenses/parity)
and [apache 2.0](https://www.apache.org/licenses/LICENSE-2.0.txt)
(contributions)
