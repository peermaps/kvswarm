var RS = require('random-slicing')

module.exports = Config

function Config (opts) {
  if (!(this instanceof Config)) return new Config(opts)
  if (opts.rs) {
    this._rs = opts.rs
  } else if (opts.bins) {
    this._rs = new RS(opts.bins)
  } else if (opts.capacities) {
    this._rs = new RS
    this._rs.set(opts.capacities)
  }
  this._writers = opts.writers
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
