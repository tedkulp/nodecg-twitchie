const {
  getMessageDetails,
  getUserDetails,
  parseCheermotes,
  parseTokens,
} = require('../utils/parseMessage')

const { events, replicants } = require('../context')
const { chat: { cheermotes } } = replicants

const parseCheermotesFromTwitch = (message) => (
  parseCheermotes(message, cheermotes.value)
)

const send = ({ scope = 'chat', action, payload } = {}) => (
  events.emitMessage({ scope, action, payload })
)

module.exports = (chat) => {
  chat.on('connected', () => {
    send({ action: 'connected' })
  })

  chat.on('connecting', () => {
    send({ action: 'connecting' })
  })

  chat.on('disconnected', (reason) => {
    send({ action: 'disconnected', payload: { reason } })
  })

  chat.on('reconnect', () => {
    send({ action: 'reconnect' })
  })

  // message fires on either a chat message, an action, or a whisper
  chat.on('message', (channel, userstate, messageText) => {
    const message = getMessageDetails(messageText, userstate)
    const user = getUserDetails(userstate)

    send({
      action: message.type, // 'action', 'chat', 'whisper'
      payload: {
        channel,
        user,
        message,
      }
    })
  })

  chat.on('messagedeleted', (channel, username, deletedMessage, userstate) => {
    // console.log('messagedeleted', { channel, username, deletedMessage, userstate })
    const messageId = userstate['target-msg-id']
    // console.log('messageId', messageId);
    if (messageId) {
      // console.log('sending....', {
      //   action: 'messagedeleted',
      //   payload: {
      //     channel,
      //     username,
      //     deletedMessage,
      //     messageId,
      //   }
      // });
      send({
        action: 'messagedeleted',
        payload: {
          channel,
          username,
          deletedMessage,
          messageId,
        }
      })
    }
  })

  // cheers contain bits within the userstate and may have special emotes in
  // their message text which need to be parsed separately via a regex, rather
  // than twitchirc's usual way of handling emotes
  chat.on('cheer', (channel, userstate, messageText) => {
    const user = getUserDetails(userstate)
    const message = getMessageDetails(messageText, userstate)
    message.tokens = parseTokens(
      message.tokens,
      (token) => parseCheermotesFromTwitch(token)
    )

    send({
      action: 'cheer',
      payload: {
        channel,
        user,
        message,
        cheer: {
          bits: userstate.bits,
        },
      }
    })
  })

  // handle when users have been naughty
  chat.on('ban', (channel, user, reason) => {
    // console.log('ban', { channel, user, reason });
    send({
      action: 'ban',
      payload: { channel, user, reason },
    })
  })

  chat.on('timeout', (channel, user, reason, duration) => {
    // console.log('timeout', { channel, user, reason, duration });
    send({
      action: 'timeout',
      payload: { channel, user, reason, duration },
    })
  })

  chat.on('clearchat', () => {
    send({ action: 'clear' })
  })

  // join/part messages are batched and dispatched every 30 seconds or so
  chat.on('join', (channel, username, self) => {
    send({
      action: 'join',
      payload: { channel, username, self },
    })
  })

  chat.on('part', (channel, username, self) => {
    send({
      action: 'part',
      payload: { channel, username, self },
    })
  })

  // handle chat config modes
  chat.on('subscribers', (channel, enabled) => {
    send({
      action: 'subscribers',
      payload: { channel, enabled },
    })
  })

  chat.on('slowmode', (channel, enabled) => {
    send({
      action: 'slowmode',
      payload: { channel, enabled },
    })
  })

  chat.on('emoteonly', (channel, enabled) => {
    send({
      action: 'emoteonly',
      payload: { channel, enabled },
    })
  })

  chat.on('r9kbeta', (channel, enabled) => {
    send({
      action: 'r9kbeta',
      payload: { channel, enabled },
    })
  })

  // handle channel-related updates which twitch sends through chat
  chat.on('subscription', (channel, username, extra = {}) => {
    send({
      scope: 'channel',
      action: 'subscription',
      payload: {
        channel,
        username,
        resub: false,
        prime: !!extra.prime,
      },
    })
  })

  chat.on('resub', (channel, username, months, messageText, userstate, extra = {}) => {
    const message = getMessageDetails(messageText)
    const cumulativeMonths = userstate['msg-param-cumulative-months'] || 0 // number of cumulative months subscribed
    const shouldShareStreak = userstate['msg-param-should-share-streak'] || false // Bool on whether the user has opted to share streak-months

    send({
      scope: 'channel',
      action: 'subscription',
      payload: {
        channel,
        username,
        months,
        message,
        resub: true,
        prime: !!extra.prime,
        cumulativeMonths,
        shouldShareStreak,
      },
    })
  })

  chat.on('raided', (channel, username, viewers) => {
    send({
      scope: 'channel',
      action: 'raided',
      payload: { channel, username, viewers },
    })
  })

  chat.on('hosted', (channel, host, viewers, autohost) => {
    send({
      scope: 'channel',
      action: 'hosted',
      payload: { channel, host, viewers, autohost },
    })
  })

  chat.on('hosting', (channel, target, viewers) => {
    send({
      scope: 'channel',
      action: 'hosting',
      payload: { channel, target, viewers },
    })
  })

  chat.on('unhost', (channel, viewers) => {
    send({
      scope: 'channel',
      action: 'unhost',
      payload: { channel, viewers },
    })
  })

  chat.on('subgift', (channel, username, streakMonths, recipient, methods, userstate) => {
    // console.log('subgift', { channel, username, streakMonths, recipient, methods, userstate });
    const senderCount = userstate['msg-param-sender-count'] || 0
    send({
      scope: 'channel',
      action: 'subgift',
      payload: {
        channel,
        username,
        streakMonths,
        numberOfSubs: 1,
        recipient,
        methods,
        senderCount,
        mystery: false,
      },
    })
  })

  chat.on('submysterygift', (channel, username, numberOfSubs, methods, userstate) => {
    // console.log('submysterygift', { channel, username, numberOfSubs, methods, userstate });
    const senderCount = userstate['msg-param-sender-count'] || 0
    send({
      scope: 'channel',
      action: 'subgift',
      payload: {
        channel,
        username,
        streakMonths: null,
        numberOfSubs,
        recipient: null,
        methods,
        senderCount,
        mystery: true,
      },
    })
  })

  chat.on('giftpaidupgrade', (channel, username, sender) => {
    send({
      scope: 'channel',
      action: 'giftpaidupgrade',
      payload: { channel, username, sender, anonymous: false },
    })
  })

  chat.on('anongiftpaidupgrade', (channel, username) => {
    send({
      scope: 'channel',
      action: 'giftpaidupgrade',
      payload: { channel, username, sender: null, anonymous: true },
    })
  })
}
