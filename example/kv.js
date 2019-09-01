let argv = require('minimist')(process.argv.slice(2))

var kv = {
  hash: function (key) {
    let keys = key.split('/')
    const buf = Buffer.allocUnsafe(8 * keys.length)
    for (var i = 0; i < keys.length; i++) {
      const key = Buffer.from(keys[i])
      sodium.crypto_shorthash(i ? buf.slice(i * 8) : buf, key, KEY)
    }
    return buf
  }
}

if (argv._[0] === 'listen') {
  let shard = require('../')({
    cluster: argv.cluster,
    swarm: require('discovery-swarm')(),
  })
  shard.listen(function (id) {
    console.log(id)
  })
} else if (argv._[0] === 'batch') {
  let shard = require('../')({
    cluster: argv.cluster,
    swarm: require('discovery-swarm')(),
    hash
  })
  let kv = shard.connect({
    network: argv.network
  })
  let rows = []
  ;[].concat(argv.put).forEach(s => {
    let [key,value] = s.split('=')
    rows.push({ type: 'put', key, value })
  })
  ;[].concat(argv.del).forEach(key => {
    rows.push({ type: 'del', key })
  })
  kv.batch(rows, (err, nodes) => {
    if (err) console.error(err)
    else nodes.forEach(node => { console.log(node) })
  })
}
