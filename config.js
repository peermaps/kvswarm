var RS = require('random-slicing')

module.exports = Config

function Config (opts) {
  if (!(this instanceof Config)) return new Config(opts)
  this._rs = opts.rs || new RS(opts.bins)
  this._writers = opts.writers
}

Config.init = function ({ capacities, writers }) {
  var rs = new RS
  rs.set(capacities)
  return new Config({ rs, writers })
}

Config.parse = function (str) {
  return new Config(JSON.parse(str))
}

Config.prototype.update = function (opts) {
  if (opts.capacities) this._rs.update(capacities)
  if (opts.writers) this._writers = opts.writers
}

Config.prototype.addWriter = function (key) {
  this._writers.push(key)
}

Config.prototype.removeWriter = function (key) {
  var ix = this._writers.indexOf(key)
  if (ix >= 0) this._writers.splice(ix,1)
}

Config.prototype.serialize = function () {
  return '{"writers":' + JSON.stringify(this._writers)
    + ',"bins":' + this._rs.serialize() + '}'
}
