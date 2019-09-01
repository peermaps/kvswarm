// copied from hypertrie/lib/node.js
module.exports = function path (i, hash) {
  i--
  const j = i >> 2
  if (j >= hash.length) return 4
  return (hash[j] >> (2 * (i & 3))) & 3
}
