'use strict'

const xmpp = require('node-xmpp-client')
const GCMMessage = require('./message')
const EventEmitter = require('events')
const crypto = require('crypto')
const async = require('async')

class GCMClient extends EventEmitter {

  /**
   * Create a new connection to the GCM XMPP service.
   * @constructor
   * @param {Object} [options]
   * @param options.senderId
   * @param options.apiKey
   */
  constructor (senderId, apiKey) {
    super()
    this._acks = []
    this._ackLimit = 100 // as per spec
    this._queue = async.queue(this._onQueueTask.bind(this), this._ackLimit)
    this._queue.pause()

    this._client = new xmpp.Client({
      jid: senderId + '@gcm.googleapis.com',
      password: apiKey,
      port: 5235,
      host: 'gcm.googleapis.com',
      legacySSL: true,
      preferredSaslMechanism: 'PLAIN'
    })

    // https://github.com/node-xmpp/client#keepalives
    this._client.connection.socket.setTimeout(0)
    this._client.connection.socket.setKeepAlive(true, 10000)

    this._client.on('online', this._onOnline.bind(this))
    this._client.on('close', this._onClose.bind(this))
    this._client.on('error', this._onError.bind(this))
    this._client.on('stanza', this._onStanza.bind(this))
  }

  /**
   * Handler for when a async.queue task is ready to be processed
   * @private
   */
  _onQueueTask (payload, cb) {
    this._acks[payload.message_id] = cb
    this._send(payload)
  }

  /**
   * xmpp.Client `online` event handler
   * @private
   */
  _onOnline () {
    this.emit('connected')
    this._queue.resume()
  }

  /**
   * xmpp.Client `close` event handler
   * @private
   */
  _onClose () {
    if (this._queue.paused) {
      this._client.connect()
    } else {
      this.emit('disconnected')
    }
  }

  /**
   * Propagate `error` events
   * @private
   */
  _onError (e) {
    this.emit('error', e)
  }

  /**
   * xmpp.Client `stanza` event handler
   * @private
   */
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

  /**
   * Creates and sends a GCM xmpp.Message
   * @private
   */
  _send (payload) {
    this._client.send(new GCMMessage(payload))
  }

  /**
   * Queue a notification for delivery
   * @param {String} to deviceToken the notification should be delivered to
   * @param {Object} notification The notification object to be sent.
   * @returns {Promise} promise - resolved once the notification has been acknowleged
   */
  send (to, notification) {
    const message_id = crypto.randomBytes(8).toString('hex')
    const payload = Object.assign(notification, { to, message_id })
    return new Promise(resolve => {
      this._queue.push(payload, (error, message_id, token) => {
        resolve({error, message_id, token})
      })
    })
  }

  /**
   * Returns true if the queue is above the ack limit
   */
  isSaturated () {
    return this._queue.length() >= this._ackLimit
  }

  /**
   * Destroys the GCM connection and empties the queue
   */
  destroy () {
    this._queue.kill()
    this._client.end()
  }

  /**
   * Ends the GCM connection once all notifications have finished sending
   */
  end () {
    if (this._queue.length() > 0) {
      this._queue.drain = this.destroy.bind(this)
    } else {
      this.destroy()
    }
  }
}

module.exports = GCMClient
