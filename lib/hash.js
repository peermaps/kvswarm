// copied from hypertrie/lib/node.js
var KEY = Buffer.alloc(16)

module.exports = function hash (sodium, keys) {
  const buf = Buffer.allocUnsafe(8 * keys.length)
  for (var i = 0; i < keys.length; i++) {
    const key = Buffer.from(keys[i])
    sodium.crypto_shorthash(i ? buf.slice(i * 8) : buf, key, KEY)
  }
  return buf
}
