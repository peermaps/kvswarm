var test = require('tape')
var KV = require('../')
var Config = require('../config')
var ram = require('random-access-memory')
var network = require('peermq/test/lib/network.js')()

test('kv', function (t) {
  var nodes = {
    A: new KV({ network, storage: storage('A') }),
    B: new KV({ network, storage: storage('B') }),
    C: new KV({ network, storage: storage('C') }),
    X: new KV({ network, storage: storage('X') }),
    Y: new KV({ network, storage: storage('Y') })
  }
  var ids = {}
  var pending = 1
  Object.keys(nodes).forEach(function (key) {
    pending++
    nodes[key].getId(function (err, id) {
      t.ifError(err)
      ids[key] = id.toString('hex')
      if (--pending === 0) setConfig()
    })
  })
  if (--pending === 0) setConfig()

  function setConfig () {
    var capacities = {}
    capacities[ids.A] = 5
    capacities[ids.B] = 12
    capacities[ids.C] = 8
    var config = new Config({
      capacities,
      writers: [ ids.X, ids.Y ]
    })
    var pending = 6
    nodes.A.setConfig(config, done)
    nodes.B.setConfig(config, done)
    nodes.C.setConfig(config, done)
    nodes.X.setConfig(config, done)
    nodes.Y.setConfig(config, done)
    done()
    function done () { if (--pending === 0) write() }
  }
  function write () {
    nodes.X.put('greeting', 'hi')
    nodes.Y.put('cool', 'beans')
    var pending = 3
    nodes.X.flush(done)
    nodes.Y.flush(done)
    done()
    function done (err) {
      t.ifError(err)
      if (--pending === 0) sync()
    }
  }
  function sync () {
    nodes.A.listen()
    nodes.B.listen()
    nodes.C.listen()
    nodes.X.connect()
    nodes.Y.connect()
    setTimeout(function () {
      nodes.X.get('cool', function (err, res) {
        console.log('cool =>', err, res)
      })
    }, 1000)
  }
})

function storage (id) {
  var stores = {}
  return function (name) {
    if (!stores[name]) stores[name] = ram()
    return stores[name]
  }
}
