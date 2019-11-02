var peermq = require('peermq')
var hypercore = require('hypercore')
var hypertrie = require('hypertrie')
var { EventEmitter } = require('events')
var { Transform } = require('readable-stream')
var sodium = require('sodium-universal')
var RS = require('random-slicing')
var hash = require('./lib/hash.js')
var HashTable = require('./lib/hash-table.js')
var varint = require('varint')
var pump = require('pump')
var { createHash } = require('crypto')
var path = require('path')

var PUT = 1, DEL = 2
var TOPIC_PREFIX = Buffer.from('peermq!')
var RECEIPT_SET_FROM = 1, RECEIPT_REQ = 2,
  RECEIPT_RES_OK = 3, RECEIPT_RES_FAIL = 4

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
  self._network = opts.network
  self._mq = peermq({
    topic: function (buf) {
      var h = createHash('sha256')
      h.update(TOPIC_PREFIX)
      h.update(buf)
      return h.digest()
    },
    network: self._network,
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
  self._connections = { trie: {}, mq: {} }
  self._core = null
  self._trieCores = {}
  self._tries = {}
  self._connectReceipts = {}
}
KV.prototype = Object.create(EventEmitter.prototype)

KV.prototype._getStorage = function (prefix, name) {
  if (typeof this._storage === 'string') {
    return path.join(this._storage, prefix, name)
  } else if (typeof this._storage === 'function') {
    return this._storage(path.join(prefix, name))
  } else {
    throw new Error('unsupported storage type ' + typeof this._storage)
  }
}

KV.prototype._getStorageFn = function (prefix, name) {
  var self = this
  return function (x) {
    return self._getStorage(prefix, path.join(name, x))
  }
}

KV.prototype.setWriters = function (writers, cb) {
  var self = this
  if (!cb) cb = noop
  self._mq.getPeers(function (err, peers) {
    if (err) return cb(err)
    var add = [], remove = []
    for (var i = 0; i < writers.length; i++) {
      var w = writers[i]
      if (peers.indexOf(w) < 0) {
        add.push(w)
      }
    }
    for (var i = 0; i < peers.length; i++) {
      var p = peers[i]
      if (writers.indexOf(p) < 0) {
        remove.push(p)
      }
    }
    self._mq.addPeers(add, function (err) {
      if (err) return cb(err)
      self._mq.removePeers(remove, function (err) {
        if (err) cb(err)
        else cb()
      })
    })
  })
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

KV.prototype.setConfig = function (config, cb) {
  this._rs = config._rs
  this._table.update(this._rs.getBins())
  this.setWriters(config._writers, cb)
}

KV.prototype.get = function (key, opts, cb) {
  var self = this
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  if (!opts) opts = {}
  if (!cb) cb = noop
  var hkey = hash(sodium, [key])
  var nodeKey = this._table.lookup(hkey)
  var k = nodeKey.toString('hex')
  var trie = this._tries[k]
  if (trie) get(trie)
  else this.once('_trie!'+k, get)

  function get (trie) {
    trie.get(key, cb)
  }
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
  var seqs = {}
  Object.keys(self._blocks).forEach(function (key) {
    pending++
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
      var vkey = varint.encode(b.value.length)
      for (var j = 0; j < vkey.length; j++) {
        message[offset++] = vkey[j]
      }
      for (var j = 0; j < b.value.length; j++) {
        message[offset++] = b.value[j]
      }
    }
    self._mq.send({ to: key, message }, function (err, seq) {
      if (!err) seqs[key] = seq
      check(err)
    })
  })
  check()
  function check (err) {
    if (finished) return
    if (err) {
      finished = true
      return cb(err)
    }
    if (--pending === 0) return wait()
  }
  function wait () {
    pending = 1
    Object.keys(seqs).forEach(function (key) {
      var seq = seqs[key]
      if (!self._connectReceipts[key]) self._connectReceipts[key] = {}
      if (!self._connectReceipts[key][seq]) self._connectReceipts[key][seq] = []
      pending++
      var core = self._trieCores[key]
      self._connectReceipts[key][seq].push(f)
      function f (err, coreLen) {
        if (finished) return
        if (err) {
          finished = true
          return cb(err)
        }
        core.update(coreLen, function (err) {
          if (finished) return
          if (err) {
            finished = true
            return cb(err)
          }
          if (--pending === 0) return cb()
        })
      }
    })
    if (--pending === 0) return cb()
  }
}

KV.prototype.connect = function () {
  var self = this
  self._mq.getKeyPairs(function (err, kp) {
    if (err) return self.emit('error', err)
    var pubKey = kp.hypercore.publicKey
    var bins = self._rs.getBins()
    Object.keys(bins).forEach(function (key) {
      var m = self._connections.mq[key] = self._mq.connect(key)
      var n = 0
      m.on('ack', function (ack) {
        ext.send(receiptReq(n++, ack))
      })
      var bkey = Buffer.from(key, 'hex')
      var c = self._connections.trie[key] = self._network.connect(bkey)
      self._trieCores[key] = hypercore(self._getStorageFn('kv',key), bkey)
      var trie = hypertrie(null, { feed: self._trieCores[key] })
      self._tries[key] = hypertrie(null, { feed: self._trieCores[key] })

      var r = self._trieCores[key].replicate(true, {
        sparse: true,
        live: true
      })
      var ext = r.registerExtension('kvswarm', {
        encoding: 'binary',
        onmessage: function (msg, peer) {
          if (msg[0] === RECEIPT_RES_FAIL || msg[0] === RECEIPT_RES_OK) {
            var seq = varint.decode(msg,1)
            if (!self._connectReceipts[key]) return
            if (!self._connectReceipts[key][seq]) return
            var rs = self._connectReceipts[key][seq]
            if (msg[0] === RECEIPT_RES_FAIL) {
              var err = new Error('receipt failed')
              for (var i = 0; i < rs.length; i++) {
                rs[i](err)
              }
            } else if (msg[0] === RECEIPT_RES_OK) {
              var coreLen = varint.decode(msg,1+varint.encodingLength(seq))
              for (var i = 0; i < rs.length; i++) {
                rs[i](null, coreLen)
              }
            }
            delete self._connectReceipts[key][seq]
            if (Object.keys(self._connectReceipts[key]).length === 0) {
              delete self._connectReceipts[key]
            }
          }
        }
      })
      ext.send(receiptFrom(pubKey))
      r.on('error', function (err) {
        console.log('error=',err)
      })
      pump(c, r, c, function (err) {
        // todo: reconnect
      })
      trie.ready(function () {
        self._tries[key] = trie
        self.emit('_trie!'+key, trie)
      })
    })
  })
}

KV.prototype.disconnect = function () {
  Object.keys(self._connections.mq).forEach(function (key) {
    self._connections.mq[key].close()
  })
  Object.keys(self._connections.trie).forEach(function (key) {
    self._connections.trie[key].close()
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
  var receipts = []
  self._mq.getKeyPairs(function (err, kp) {
    if (err) return cb(err)
    self._core = hypercore(
      self._getStorageFn('kv','core'),
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
        //console.log(`RECEIVED ${from}@${seq}: ${data}`)
        self._handleData(data, function (err) {
          if (err) {
            console.log(err + '\n')
          }
          self._mq.clear({ from, seq }, check)
          function check (err) {
            next(err)
            for (var i = 0; i < receipts.length; i++) {
              var r = receipts[i]
              if (seq >= r[0]) {
                receipts.splice(i--,1)
                r[2](err)
              }
            }
          }
        })
      }
    }))
    // todo: these 2 protocol swarms should be overlayed with an extension
    self._mq.listen(function (err, server) {
      if (err) return cb(err)
      self._mqServer = server
      cb(null, kp.hypercore.publicKey, server)
    })
    self._server = self._network.createServer(function (stream) {
      var r = self._core.replicate(false, { download: false, live: true })
      var from = null
      var ext = r.registerExtension('kvswarm', {
        encoding: 'binary',
        onmessage: function (msg, peer) {
          if (msg[0] === RECEIPT_SET_FROM) {
            from = msg.slice(1,33).toString('hex')
          } else if (msg[0] === RECEIPT_REQ) {
            if (!from) return ext.send(receiptFail(n, 'recipient not set'))
            var offset = 1
            var n = varint.decode(msg,offset)
            offset += varint.encodingLength(n)
            var start = varint.decode(msg,offset)
            offset += varint.encodingLength(start)
            var len = varint.decode(msg,offset)
            var bf = self._mq._bitfield.read[from]
            if (!bf) return ext.send(receiptFail(n, 'bitfield not found'))
            hasAll(bf, start, len, function (err, all) {
              if (err) return ext.send(receiptFail(n, err.message))
              if (all) return ext.send(receiptOk(n, self._trie.feed.length))
              // otherwise wait until the data has been completely processed
              receipts.push([
                start, len, function (err) {
                  return ext.send(err
                    ? receiptFail(n, err)
                    : receiptOk(n, self._trie.feed.length))
                }
              ])
            })
          }
        }
      })
      pump(stream, r, stream, function (err) {
        console.log('error=',err)
      })
    })
    self._server.listen(kp.hypercore.publicKey)
  })
}

KV.prototype._handleData = function (data, cb) {
  var offset = 0, pending = 1, finished = false
  try {
    while (offset < data.length) {
      if (data[0] === PUT) {
        offset += 1
        var klen = varint.decode(data, offset)
        offset += varint.encodingLength(klen)
        var key = data.slice(offset,offset+klen)
        offset += klen
        var vlen = varint.decode(data, offset)
        offset += varint.encodingLength(vlen)
        var value = data.slice(offset,offset+vlen)
        offset += vlen
        pending++
        this._trie.put(key.toString(), value, done)
      } else if (data[0] === DEL) {
        offset += 1
        var klen = varint.decode(data, offset)
        offset += varint.encodingLength(klen)
        var key = data.slice(offset,offset+klen)
        offset += klen
        pending++
        this._trie.del(key.toString(), done)
      } else {
        break
      }
    }
  } catch (err) {
    process.nextTick(done, err)
  }
  done()
  function done (err) {
    if (finished) {}
    else if (err) {
      finished = true
      cb(err)
    } else if (--pending === 0) {
      cb()
    }
  }
}

function noop () {}

function writeBuf (out, offset, src) {
  for (var i = 0; i < src.length; i++) {
    out[offset+i] = src[i]
  }
}

function receiptReq (n, ack) {
  var nLen = varint.encodingLength(n)
  var startLen = varint.encodingLength(ack.start)
  var lenLen = varint.encodingLength(ack.length)
  var buf = Buffer.alloc(1 + nLen + startLen + lenLen)
  var offset = 0
  buf[offset] = RECEIPT_REQ
  offset += 1
  writeBuf(buf, offset, varint.encode(n))
  offset += nLen
  writeBuf(buf, offset, varint.encode(ack.start))
  offset += startLen
  writeBuf(buf, offset, varint.encode(ack.length))
  offset += lenLen
  return buf
}

function receiptFrom (key) {
  var buf = Buffer.alloc(1 + key.length)
  buf[0] = RECEIPT_SET_FROM
  writeBuf(buf, 1, key)
  return buf
}

function receiptOk (n, coreLen) {
  var nLen = varint.encodingLength(n)
  var csLen = varint.encodingLength(coreLen)
  var buf = Buffer.alloc(1 + nLen + csLen)
  var offset = 0
  buf[offset] = RECEIPT_RES_OK
  offset += 1
  writeBuf(buf, offset, varint.encode(n))
  offset += nLen
  writeBuf(buf, offset, varint.encode(coreLen))
  offset += csLen
  return buf
}

function receiptFail (n, msg) {
  var nLen = varint.encodingLength(n)
  var buf = Buffer.alloc(1 + nLen + msg.length)
  var offset = 0
  buf[offset] = RECEIPT_RES_FAIL
  offset += 1
  writeBuf(buf, offset, varint.encode(n))
  offset += nLen
  writeBuf(buf, offset, msg)
  return buf
}

function hasAll (bf, start, len, cb) {
  var pending = 1, finished = false
  for (var i = 0; i < len; i++) {
    bf.has(start+i, function (err, ex) {
      if (finished) return
      if (err) {
        finished = true
        return cb(err)
      }
      if (!ex) {
        finished = true
        return cb(null, false)
      }
      if (--pending === 0) cb(null, true)
    })
  }
  if (--pending === 0) cb(null, true)
}
