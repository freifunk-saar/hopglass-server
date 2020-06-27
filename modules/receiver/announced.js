/*  Copyright (C) 2019 Milan Pässler
    Copyright (C) 2019 HopGlass Server contributors

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>. */

'use strict'

const dgram = require('dgram')
const zlib = require('zlib')
const _ = require('lodash')

const config = {
  /* eslint-disable quotes */
  "target": {
    "ip": "ff02::2:1001",
    "port": 1001
  },
  "port": 45123,
  "timings": {
    "base": 300,
    "multipliers": {
      "statistics": 10,
      "neighbours": 10
    }
  }
}

delete require.cache[__filename]

module.exports = function(receiverId, configData, api) {
  _.merge(config, configData)

  const collector = dgram.createSocket('udp6')

  //collector callbacks
  collector.on('error', function(err) {
    throw(err)
  })

  collector.on('message', function(msg) {
    zlib.inflateRaw(msg, function(err, res) {
      if (err) {
        console.log('ERR: ' + err)
      } else {
        try {
          const obj = JSON.parse(res)
          let id
          if (obj.nodeinfo) {
            id = obj.nodeinfo.node_id
          } else if (obj.statistics) {
            id = obj.statistics.node_id
          } else if (obj.neighbours) {
            id = obj.neighbours.node_id
          } else return
          api.receiverCallback(id, obj, receiverId)
        }
        catch (err) {
          console.log('JSON.parse ERROR! ' + err)
        }
      }
    })
  })

  async function retrieve(stat, address) {
    const ip = address ? address : config.target.ip
    const req = Buffer.from('GET ' + stat)
    for (const iface of api.sharedConfig.ifaces) {
      await new Promise((resume) => {
        collector.setMulticastInterface(ip + '%' + iface)
        collector.send(req, 0, req.length, config.target.port, ip + '%' + iface, function (err) {
          if (err) console.error(err)
          resume()
        })
      })
    }
  }

  collector.on('listening', function() {
    collector.setTTL(1) // restrict hop-limit to own subnet / should prevent loops (default was: 64)
    console.log('collector listening on port ' + config.port)
    retrieve('nodeinfo')
  })

  collector.bind(config.port)

  setInterval(function() {
    retrieve('nodeinfo')
  }, config.timings.base * 1000)

  setTimeout(function() {
    retrieve('statistics')
    setInterval(function() {
      retrieve('statistics')
    }, config.timings.base / config.timings.multipliers.statistics * 1000)
  }, (config.timings.base / config.timings.multipliers.statistics / 3) * 1000)

  setTimeout(function() {
    retrieve('neighbours')
    setInterval(function() {
      retrieve('neighbours')
    }, config.timings.base / config.timings.multipliers.neighbours * 1000)
  }, ((config.timings.base / config.timings.multipliers.statistics / 3) + (config.timings.base / config.timings.multipliers.neighbours / 3)) * 1000)
}
