var argv = require('minimist')(process.argv.slice(2), {
  alias: { d: 'datadir' }
})

var kv = require('../')({
  network: require('peermq/network'),
  bins: argv.bins,
  storage: argv.datadir
})

if (argv._[0] === 'id') {
  kv.getId(function (err, id) {
    if (err) console.error(err)
    else console.log(id.toString('hex'))
  })
} else if (argv._[0] === 'add-peer') {
  argv._.slice(1).forEach(function (peer) {
    kv.addPeer(peer)
  })
} else if (argv._[0] === 'listen') {
  kv.listen(function (err, pubKey) {
    if (err) console.error(err)
    else console.log(pubKey.toString('hex'))
  })
} else if (argv._[0] === 'connect') {
  kv.connect()
} else {
  ;[].concat(argv.put).forEach(s => {
    var [key,value] = s.split('=')
    kv.put(key, value)
  })
  ;[].concat(argv.del).forEach(key => {
    kv.del(key)
  })
  kv.flush(function (err) {
    if (err) console.error(err)
  })
}
