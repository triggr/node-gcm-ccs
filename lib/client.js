'use strict'

const xmpp = require('node-xmpp-client')
const GCMMessage = require('./message')
const EventEmitter = require('events')
const crypto = require('crypto')
const async = require('async')

class GCMClient extends EventEmitter {

  constructor (projectId, apiKey) {
    super()
    this._acks = []
    this._ackLimit = 100
    this._queue = async.queue(this._onQueueTask.bind(this), this._ackLimit)
    this._queue.pause()

    this._client = new xmpp.Client({
      jid: projectId + '@gcm.googleapis.com',
      password: apiKey,
      port: 5235,
      host: 'gcm.googleapis.com',
      legacySSL: true,
      preferredSaslMechanism: 'PLAIN'
    })

    this._client.connection.socket.setTimeout(0)
    this._client.connection.socket.setKeepAlive(true, 10000)

    this._client.on('online', this._onOnline.bind(this))
    this._client.on('close', this._onClose.bind(this))
    this._client.on('error', this._onError.bind(this))
    this._client.on('stanza', this._onStanza.bind(this))
  }

  _onQueueTask (payload, cb) {
    this._acks[payload.message_id] = cb
    this._send(payload)
  }

  _onOnline () {
    this.emit('connected')
    this._queue.resume()
  }

  _onClose () {
    if (this._queue.paused) {
      this._client.connect()
    } else {
      this.emit('disconnected')
    }
  }

  _onError (e) {
    this.emit('error', e)
  }

  _onStanza (stanza) {
    if (stanza.is('message') && stanza.attrs.type !== 'error') {
      const data = JSON.parse(stanza.getChildText('gcm'))

      if (!data || !data.message_id) {
        return
      }

      switch (data.message_type) {
        case 'control':
          if (data.control_type === 'CONNECTION_DRAINING') {
            this._queue.pause()
          }
          break

        case 'ack':
        case 'nack':
          if (data.message_id in this._acks) {
            this._acks[data.message_id](data.error, data.message_id, data.from)
            delete this._acks[data.message_id]
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
      const message = stanza.getChildText('error').getChildText('text')
      this.emit('message-error', message)
    }
  }

  _send (payload) {
    this._client.send(new GCMMessage(payload))
  }

  send (to, data, options, cb) {
    cb = cb || function () {}
    const message_id = crypto.randomBytes(8).toString('hex')
    const payload = Object.assign({ to, message_id, data }, options)
    this._queue.push(payload, cb)
  }

  end () {
    this._queue.kill() // maybe queue.drain, so that all messages are sent?
    this._client.end()
  }
}

module.exports = GCMClient
