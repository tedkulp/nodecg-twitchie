const express = require('express')
const bodyParser = require('body-parser')
const context = require('./context')
const client = require('./client')
const request = require('request-promise-native')
const debounce = require('debounce')
const crypto = require('crypto')

const { log, replicants, config, twitch, nodecg } = context
const { channel, user } = replicants

const SECRET = process.env.SECRET || '123456'
const URL_BASE = process.env.URL_BASE || 'http://localhost'
const LEASE_TIME = process.env.LEASE_TIME || (60 * 60)
const LEASE_RENEW_TIME = process.env.LEASE_RENEW_TIME || (60 * 40)

let currentChannelName = undefined
let currentChannelId = undefined

const app = express()

const hubUrl = `https://api.twitch.tv/helix/webhooks/hub`
const getTopicUrl = channelId => {
  return `https://api.twitch.tv/helix/users/follows?first=1&to_id=${channelId}`
}

const getChannelId = (channelName) => {
  return request({
      url: `https://api.twitch.tv/helix/users?login=${channelName}`,
      method: 'GET',
      json: true,
      headers: {
        Accept: 'application/vnd.twitchtv.v5+json',
        'Client-ID': config.clientID,
      },
  }).then(resp => {
    return resp && resp.data && resp.data[0] && resp.data[0].id
  })
}

const hubRequest = (channelId, mode) => {
  return request({
    url: hubUrl,
    method: 'POST',
    json: true,
    headers: {
      'Client-ID': config.clientID,
      'Content-type': 'application/json',
    },
    body: {
      'hub.mode': mode,
      'hub.callback': `${URL_BASE}/webhook`,
      'hub.topic': getTopicUrl(channelId),
      'hub.lease_seconds': LEASE_TIME,
      'hub.secret': SECRET,
    },
  })
}

const subscribe = channelName => {
  return getChannelId(channelName).then(channelId => {
    if (channelId) {
      return hubRequest(channelId, 'subscribe')
      .then(resp => {
        return [channelId, resp]
      })
    } else {
      return Promise.resolve([undefined, undefined])
    }
  })
}

const unsubscribe = channelName => {
  return getChannelId(channelName).then(channelId => {
    if (channelId) {
      return hubRequest(channelId, 'unsubscribe')
      .then(resp => {
        return [channelId, resp]
      })
    } else {
      return Promise.resolve([undefined, undefined])
    }
  })
}

const doSubscribe = (channelName, action = 'sub') => {
  log.debug(`starting ${action}`, channelName)
  return subscribe(channelName).then(([channelId, resp]) => {
    currentChannelId = channelId
    log.info(`done ${action}`, channelName, channelId)
  }).catch(err => {
    log.error(`error doing ${action}`, channelName, err)
  })
}

const doUnsubscribe = (channelName, action = 'unsub') => {
  log.debug(`starting ${action}`, channelName)
  return unsubscribe(channelName).then(() => {
    log.info(`done ${action}`, channelName)
  }).catch(err => {
    log.error(`error doing ${action}`, channelName, err)
  })
}

const handleChannelChange = newChannelName => {
  if (newChannelName) {
    if (newChannelName !== currentChannelName) {
      if (currentChannelName) {
        doUnsubscribe(currentChannelName)
      }

      currentChannelName = newChannelName
      doSubscribe(newChannelName)
    }
  } else if (currentChannelName) { // If we were in a channel and now aren't...
    doUnsubscribe(currentChannelName)
    currentChannelName = undefined
  }
}

const debouncedHandleChannelChange = debounce(handleChannelChange, 5000);

channel.id.on('change', (newChannelName) => {
  debouncedHandleChannelChange(newChannelName)
})

setInterval(() => {
  if (currentChannelName) {
    doSubscribe(currentChannelName, 'resub')
  }
}, LEASE_RENEW_TIME * 1000)

app.get('/webhook', (request, response) => {
  if (
    request.query['hub.challenge'] &&
    (request.query['hub.mode'] === 'subscribe' || request.query['hub.mode'] === 'unsubscribe')
  ) {
      response.status(200).send(request.query['hub.challenge'])
  } else {
      response.status(400).send('ERROR: Invalid request!')
  }
})

app.post('/webhook', (request, response, next) => {
  const body = request && request.body
  const data = body && body.data && body.data[0]

  // const signature = request.header('X-Hub-Signature').split('=')[1]
  // log.info('signature', signature);
  // const sigValid =
  //     crypto
  //         .createHmac('sha256', SECRET)
  //         .update(request['rawBody'])
  //         .digest('hex') === signature
  // log.info('sig valid', sigValid)
  const sigValid = true

  if (data && sigValid) {
    if (data.to_name && data.to_id === currentChannelId) {
      log.info('sending follow event for', data.from_name)
      nodecg.sendMessage('webhook.follow', {
        name: data.from_name,
        channelId: currentChannelId,
        channel: `#${currentChannelName}`
      })
    }
    response.status(200).json({})
  } else {
    response.status(400).json({
      error: 'ERROR: Invalid request!'
    })
  }
})

module.exports = app
