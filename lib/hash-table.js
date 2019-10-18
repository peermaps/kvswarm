module.exports = HashTable

var MAX = 256n**16n-1n // hypertrie hashes are 16 bytes
var HBYTES = 16

function HashTable (bins) {
  if (!(this instanceof HashTable)) return new HashTable(bins)
  this._table = []
  this.update(bins)
}

HashTable.prototype.update = function (bins) {
  var self = this
  Object.keys(bins).forEach(function (key) {
    bins[key].slices.forEach(function (slice) {
      var start = slice[0], end = slice[1]
      var hstart = (start[0]*MAX/start[1]).toString(16).padStart(HBYTES*2,'0')
      var hend = (end[0]*MAX/end[1]).toString(16).padStart(HBYTES*2,'0')
      self._table.push([
        Buffer.from(hstart,'hex'),
        Buffer.from(hend,'hex'),
        key
      ])
    })
  })
  self._table.sort(cmpIv)
}
function cmpIv (a, b) { return a[0] < b[0] ? -1 : +1 }

HashTable.prototype.lookup = function (hash) {
  var len = this._table.length
  var start = 0, end = len
  while (true) {
    var n = Math.floor((end + start) / 2)
    var t = this._table[n]
    var c0 = Buffer.compare(hash, t[0])
    var c1 = Buffer.compare(hash, t[1])
    if (c0 >= 0 && (c1 < 0 || (c1 === 0 && n === len-1))) {
      return t[2]
    } else if (start === n || end === n) {
      break
    } else if (c0 < 0) {
      end = n
    } else {
      start = n
    }
  }
  return null
}
