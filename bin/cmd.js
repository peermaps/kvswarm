#!/usr/bin/env node
var argv = require('minimist')(process.argv.slice(2), {
  alias: { d: 'datadir', c: 'config' }
})
if (argv._[0] === 'id') {
  var KV = require('../')
  var kv = new KV({
    network: require('peermq/network'),
    storage: argv.datadir
  })
  kv.getId(function (err, id) {
    if (err) console.error(err)
    else console.log(id.toString('hex'))
  })
} else if (argv._[0] === 'init') {
  var Config = require('../config')
  console.log(new Config({
    capacities: argv.capacity,
    writers: [].concat(argv.writer)
  }).serialize())
} else if (argv._[0] === 'get') {
  var kv = getKV()
  kv.get(argv._[1], function (err, value) {
    if (err) console.error(err)
    else console.log(value)
  })
} else if (argv._[0] === 'write') {
  var kv = getKV()
  Object.entries(argv.put || {}).forEach(([key,value]) => {
    kv.put(key, value)
  })
  Object.keys(argv.del || {}).forEach(key => {
    kv.del(key)
  })
  kv.flush(function (err) {
    if (err) console.error(err)
  })
} else if (argv._[0] === 'listen') {
  var kv = getKV()
  kv.listen(function (err, pubKey, server) {
    if (err) console.error(err)
    else console.log(pubKey.toString('hex'))
  })
} else if (argv._[0] === 'connect') {
  getKV().connect()
}

function getKV () {
  var KV = require('../')
  var Config = require('../config')
  var fs = require('fs')
  return new KV({
    network: require('peermq/network'),
    storage: argv.datadir,
    config: Config.parse(fs.readFileSync(argv.config, 'utf8'))
  })
}
