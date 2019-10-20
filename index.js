var peermq = require('peermq')
var hypercore = require('hypercore')
var hypertrie = require('hypertrie')
var { EventEmitter } = require('events')
var { Transform } = require('readable-stream')
var sodium = require('sodium-universal')
var RS = require('random-slicing')
var hash = require('./lib/hash.js')
var HashTable = require('./lib/hash-table.js')
var xbytes = require('xbytes')
var varint = require('varint')
var path = require('path')

var PUT = 1, DEL = 2

module.exports = KV

function KV (opts) {
  var self = this
  if (!(self instanceof KV)) return new KV(opts)
  self._storage = opts.storage
  if (typeof self._storage !== 'string'
  && typeof self._storage !== 'function') {
    throw new Error('storage must be a string path or function.'
      + ' received: ' + typeof self._storage)
  }
  self._mq = peermq({
    network: opts.network,
    storage: function (name) {
      return self._getStorage('mq',name)
    }
  })
  if (opts.config) {
    self.setWriters(opts.config._writers, function (err) {
      if (err) self.emit('error', err)
    })
    self._rs = opts.config._rs
  } else if (typeof opts.bins === 'string') {
    self._rs = RS.parse(opts.bins)
  } else if (opts.bins && typeof opts.bins.getBins === 'function') {
    self._rs = opts.bins
  } else {
    self._rs = new RS(opts.bins)
  }
  self._table = new HashTable(self._rs.getBins())
  self._blocks = {}
  self._connections = {}
  self._core = null
}
KV.prototype = Object.create(EventEmitter.prototype)

KV.prototype._getStorage = function (prefix, name) {
  if (typeof this._storage === 'string') {
    return path.join(this._storage, prefix, name)
  } else if (typeof this._storage === 'function') {
    return this._storage(path.join(prefix, name))
  }
}

KV.prototype.setWriters = function (writers, cb) {
  var self = this
  if (!cb) cb = noop
  var finished = false
  self._mq.getPeers(function (err, peers) {
    if (err) return cb(err)
    var pending = 1
    for (var i = 0; i < writers.length; i++) {
      var w = writers[i]
      if (peers.indexOf(w) < 0) {
        pending++
        self.addWriter(w, done)
      }
    }
    for (var i = 0; i < peers.length; i++) {
      var p = peers[i]
      if (writers.indexOf(p) < 0) {
        pending++
        self.removeWriter(p, done)
      }
    }
  })
  function done (err) {
    if (finished) {}
    else if (err) {
      finished = true
      cb(err)
    } else {
      cb()
    }
  }
}

KV.prototype.getWriters = function (cb) {
  this._mq.getPeers(cb)
}

KV.prototype.addWriter = function (peer, cb) {
  this._mq.addPeer(peer, cb)
}

KV.prototype.removeWriter = function (peer, cb) {
  this._mq.removePeer(peer, cb)
}

KV.prototype.setBins = function (update) {
  this._rs.set(update)
  this._table.update(this._rs.getBins())
}

KV.prototype.load = function (config, cb) {
  this._rs = config._rs
  this.setWriters(config._writers, cb)
  this._table.update(this._rs.getBins())
}

KV.prototype.get = function (key, cb) {
  var hkey = hash(sodium, [key])
  var nodeKey = this._table.lookup(hkey)
  console.log(`TODO: lookup ${hkey.toString('hex')} on ${nodeKey.toString('hex')}`)
}

KV.prototype.put = function (key, value) {
  if (typeof key === 'string') key = Buffer.from(key)
  if (typeof value === 'string') value = Buffer.from(value)
  var hkey = hash(sodium, [key])
  var nodeKey = this._table.lookup(hkey)
  if (!this._blocks[nodeKey]) this._blocks[nodeKey] = []
  this._blocks[nodeKey].push({ type: 'put', key, value })
}

KV.prototype.del = function (key) {
  var hkey = hash(sodium, [key])
  var nodeKey = this._table.lookup(hkey)
  if (!this._blocks[nodeKey]) this._blocks[nodeKey] = []
  this._blocks[nodeKey].push({ type: 'del', key, value })
}

KV.prototype.flush = function (opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  if (!opts) opts = {}
  if (!cb) cb = noop
  var self = this
  var finished = false
  var pending = 1
  Object.keys(self._blocks).forEach(function (key) {
    var len = 0
    for (var i = 0; i < self._blocks[key].length; i++) {
      var b = self._blocks[key][i]
      len += 1
      len += varint.encodingLength(b.key.length)
      len += b.key.length
      len += varint.encodingLength(b.value.length)
      len += b.value.length
    }
    var message = Buffer.alloc(len)
    var offset = 0
    for (var i = 0; i < self._blocks[key].length; i++) {
      var b = self._blocks[key][i]
      if (b.type === 'put') {
        message[offset++] = PUT
      } else if (b.type === 'del') {
        message[offset++] = DEL
      }
      var nkey = varint.encode(b.key.length)
      for (var j = 0; j < nkey.length; j++) {
        message[offset++] = nkey[j]
      }
      for (var j = 0; j < b.key.length; j++) {
        message[offset++] = b.key[j]
      }
      var vkey = varint.encode(b.key.length)
      for (var j = 0; j < vkey.length; j++) {
        message[offset++] = vkey[j]
      }
      for (var j = 0; j < b.value.length; j++) {
        message[offset++] = b.value[j]
      }
    }
    self._mq.send({ to: key, message }, done)
  })
  done()
  function done (err) {
    if (finished) return
    if (err) {
      finished = true
      return cb(err)
    }
    if (--pending === 0) return cb()
  }
}

KV.prototype.connect = function () {
  var self = this
  var bins = self._rs.getBins()
  Object.keys(bins).forEach(function (key) {
    self._connections[key] = self._mq.connect(key)
  })
}

KV.prototype.disconnect = function () {
  Object.keys(self._connections).forEach(function (key) {
    self._connections[key].close()
  })
}

KV.prototype.getId = function (cb) {
  this._mq.getId(cb)
}

KV.prototype.listen = function (cb) {
  if (!cb) cb = noop
  var self = this
  if (self._unread) throw new Error('already listening')
  self._unread = self._mq.createReadStream('unread', { live: true })
  self._mq.getKeyPairs(function (err, kp) {
    if (err) return cb(err)
    self._core = hypercore(
      self._getStorage('kv','core'),
      kp.hypercore.publicKey,
      {
        storeSecretKey: false,
        secretKey: kp.hypercore.secretKey
      }
    )
    self._trie = hypertrie(null, { feed: self._core })
    self._unread.pipe(new Transform({
      objectMode: true,
      transform: function ({ from, seq, data }, enc, next) {
        console.log(`RECEIVED ${from}@${seq}: ${data}`)
        // self._trie.put(...)
        self._mq.archive({ from, seq }, next)
      }
    }))
    self._mq.listen(function (err, server) {
      if (err) cb(err)
      else cb(null, kp.hypercore.publicKey, server)
    })
  })
}

function noop () {}
