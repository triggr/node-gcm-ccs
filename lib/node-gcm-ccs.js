'use strict'

var xmpp = require('node-xmpp-client')
var EventEmitter = require('events')
var crypto = require('crypto')
var async = require('async')

class GCMClient extends EventEmitter {

  constructor (projectId, apiKey) {
    super()
    this.draining = true
    this.queued = []
    this.acks = []
    this.ackLimit = 100
    this.ackQueue = async.queue((task, done) => {
      this.acks[task.message_id] = done
      this._send(task)
    }, this.ackLimit)

    this.client = new xmpp.Client({
      jid: projectId + '@gcm.googleapis.com',
      password: apiKey,
      port: 5235,
      host: 'gcm.googleapis.com',
      legacySSL: true,
      preferredSaslMechanism: 'PLAIN'
    })

    this.client.connection.socket.setTimeout(0)
    this.client.connection.socket.setKeepAlive(true, 10000)

    this.client.on('online', this._onOnline.bind(this))
    this.client.on('close', this._onClose.bind(this))
    this.client.on('error', this._onError.bind(this))
    this.client.on('stanza', this._onStanza.bind(this))
  }

  _onOnline () {
    this.emit('connected')
    if (this.draining) {
      this.draining = false
      var i = this.queued.length
      while (i--) {
        this._send(this.queued[i])
      }
      this.queued = []
    }
  }

  _onClose () {
    if (this.draining) {
      this.client.connect()
    } else {
      this.emit('disconnected')
    }
  }

  _onError (e) {
    this.emit('error', e)
  }

  _onStanza (stanza) {
    if (stanza.is('message') && stanza.attrs.type !== 'error') {
      var data = JSON.parse(stanza.getChildText('gcm'))
      if (!data || !data.message_id) {
        return
      }

      switch (data.message_type) {
        case 'control':
          if (data.control_type === 'CONNECTION_DRAINING') {
            this.draining = true
          }
          break

        case 'ack':
        case 'nack':
          if (data.message_id in this.acks) {
            this.acks[data.message_id](data.error, data.message_id, data.from)
            delete this.acks[data.message_id]
          }
          break

        case 'receipt':
          this.emit('receipt', data.message_id, data.from, data.category, data.data)
          break

        default:
          // Send ack, as per spec
          if (data.from) {
            this._send({
              to: data.from,
              message_id: data.message_id,
              message_type: 'ack'
            })

            if (data.data) {
              this.emit('message', data.message_id, data.from, data.category, data.data)
            }
          }
          break
      }
    } else {
      console.log('err')
      var message = stanza.getChildText('error').getChildText('text')
      this.emit('message-error', message)
    }
  }

  _send (json) {
    if (this.draining) {
      this.queued.push(json)
    } else {
      var message = new xmpp.Message()
        .c('gcm', { xmlns: 'google:mobile:data' })
        .t(JSON.stringify(json))
      this.client.send(message)
    }
  }

  send (to, data, options, cb) {
    cb = cb || function () {}
    var message_id = crypto.randomBytes(8).toString('hex')
    var payload = Object.assign({ to, message_id, data }, options)
    this.ackQueue.push(payload, cb)
  }

  end () {
    this.ackQueue.kill()
    this.client.end()
  }
}

module.exports = GCMClient
