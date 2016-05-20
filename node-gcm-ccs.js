'use strict'

var xmpp = require('node-xmpp-client')
var EventEmitter = require('events')
var crypto = require('crypto')


class GCMClient extends EventEmitter {

  constructor (projectId, apiKey) {
    super()

    this.draining = true
    this.queued = []
    this.acks = []

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

        case 'nack':
          if (data.message_id in this.acks) {
            this.acks[data.message_id](data.error, data.message_id, data.from)
            delete this.acks[data.message_id]
          }
          break

        case 'ack':
          if (data.message_id in this.acks) {
            this.acks[data.message_id](undefined, data.message_id, data.from)
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
      var message = stanza.getChildText('error').getChildText('text')
      this.emit('message-error', message)
    }
  }

  _send (json) {
    if (this.draining) {
      this.queued.push(json)
    } else {
      var message = new xmpp.Stanza.Element('message').c('gcm', { xmlns: 'google:mobile:data' }).t(JSON.stringify(json))
      this.client.send(message)
    }
  }

  send (to, data, options, cb) {
    var messageId = crypto.randomBytes(8).toString('hex')

    var outData = {
      to: to,
      message_id: messageId,
      data: data
    }
    Object.keys(options).forEach((option) => {
      outData[option] = options[option]
    })

    if (cb !== undefined) {
      this.acks[messageId] = cb
    }

    this._send(outData)
  }

  end () {
    this.client.end()
  }

  isReady () {
    return Object.keys(this.acks).length <= 100
  }
}

module.exports = GCMClient
