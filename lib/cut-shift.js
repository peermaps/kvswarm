// cut shift gap collection algorithm
var almostEqual = require('almost-equal')

module.exports = function ({ newBins, oldBins, n, intervals }) {
  /*
  var p = bins.length
  var nsum = 0
  for (var i = 0; i < n; i++) {
    nsum += bins[i]
  }
  var psum = 0
  for (var i = 0; i < p; i++) {
    psum += bins[i]
  }
  var r = []
  for (var i = 0; i < n; i++) {
    r[i] = bins[i] / nsum - bins[i] / psum
  }
  */
  var newSum = 0
  for (var i = 0; i < newBins.length; i++) {
    newSum += newBins[i]
  }
  var oldSum = 0
  for (var i = 0; i < oldBins.length; i++) {
    oldSum += oldBins[i]
  }
  var r = []
  for (var i = 0; i < oldBins.length; i++) {
    r[i] = (oldBins[i] || 0) / oldSum - newBins[i] / newSum
  }
  console.log('r=',r)
  var gaps = []
  var cutIntervalEnd = false
  var assimilatedCompletely = false
  for (var i = 0; i < intervals.length; i++) {
    var iv = intervals[i]
    var b = iv[2]
    var g = gaps[gaps.length-1]
    if (r[b] <= 0) continue
    if (iv[1]-iv[0] < r[b]) {
      if (adjacent(g,iv)) {
        g[1] += iv[1]-iv[0]
      } else {
        console.log('PUSH 0', iv[0], ',', iv[1])
        gaps.push([iv[0],iv[1]])
      }
      r[b] -= iv[1]-iv[0]
      if (assimilatedCompletely) {
        cutIntervalEnd = false
      }
      assimilatedCompletely = true
    } else {
      if (adjacent(g,iv)) {
        g[1] += iv[1]-iv[0]
      } else {
        if (cutIntervalEnd) {
          console.log('PUSH 1', iv[0],'-',r[b],',',iv[1],
            '=',iv[1]-r[b],',',iv[1])
          gaps.push([iv[1]-r[b],iv[1]])
        } else {
          console.log('PUSH 2',iv[0],',',iv[0],'+',r[b],
            '=',iv[0],',',iv[0]+r[b])
          gaps.push([iv[0],iv[0]+r[b]])
        }
        r[b] = 0
        cutIntervalEnd = !cutIntervalEnd
      }
      assimilatedCompletely = false
    }
  }
  return gaps
}

function adjacent (g, iv) {
  if (!g) return false
  return almostEqual(g[1],iv[0]) || almostEqual(g[0],iv[1])
}
