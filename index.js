var peermq = require('peermq')
var { EventEmitter } = require('events')
var { Transform } = require('readable-stream')
var lenpre = require('length-prefixed-stream')

module.exports = Writer

function Writer (opts) {
  var self = this
  if (!(self instanceof Writer)) return new Writer(opts)
  self._slices = opts.slices
  self._peers = opts.peers
  self._capacity = opts.capacity
  self._mq = peermq({
    network: opts.network,
    storage: opts.storage
  })
  self._ready = false
  self._mq.getPeers(function (err, peers) {
    var pending = 1
    opts.peers.forEach(function (peer) {
      if (!peers.includes(peer)) {
        pending++
        self._mq.addPeer(peer, done)
      }
    })
    peers.forEach(function (peer) {
      if (!opts.peers.includes(peer)) {
        pending++
        self._mq.removePeer(peer, done)
      }
    })
    done()
    function done () {
      if (--pending !== 0) return
      self._ready = true
    }
  })
}

Write.prototype.update = function (config) {
  // TODO
}

Write.prototype.listen = function () {
  var self = this
  if (self._unread) throw new Error('already listening')
  self._mq.listen()
  self._unread = self._mq.createReadStream('unread', { live: true })
  self._unread.pipe(new Transform({
    objectMode: true,
    transform: function ({ from, seq, data }, enc, next) {
      mq.archive({ from, seq }, next)
    }
  })
}
