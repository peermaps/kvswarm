var RSlice = require('../lib/rslice.js')
var rs = new RSlice({
  A: { size: 40, slices: [[0,0.5]] },
  B: { size: 40, slices: [[0.5,1]] }
})
rs.add('C', 40)
Object.entries(rs.bins).forEach(([name,bin]) => {
  console.log(name, JSON.stringify(bin))
})
