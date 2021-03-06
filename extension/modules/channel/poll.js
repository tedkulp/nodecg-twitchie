const { nodecg, replicants, config } = require('../../context')
const api = require('../../api')

const { user, channel, stream } = replicants

let updateTimeout

const fetchFollowers = () => api.followers()
  .then(
    (followerInfo) => followerInfo.follows
  )

// if a stream is active, the api response will contain the
// channel's information as well; therefore, we only need to
// specifically request it if no stream is active
const fetchInfo = () => api.stream()
  .then((streamInfo) => streamInfo.stream
    ? {
      stream: streamInfo.stream,
      channel: streamInfo.stream.channel,
    }
    : (
      api.channel()
        .then((channelInfo) => ({ channel: channelInfo }))
    )
  )

const update = () => {
  updateTimeout = clearTimeout(updateTimeout)

  Promise.all([
    fetchInfo(),
    fetchFollowers()
  ])
    .then(([info, followers]) => {
      channel.info.value = Object.assign({}, info.channel)
      channel.followers.value = [...followers]
      stream.info.value = Object.assign({}, info.stream)
    }).catch((err) => {
      nodecg.log.error('Couldn\'t retrieve channel info :()', err)
    }).then(() => {
      updateTimeout = setTimeout(update, config.timeBetweenUpdates)
    })
}

user.id.on('change', (newUserId) => {
  channel.info.value = undefined
  channel.followers.value = undefined
  stream.info.value = undefined

  if (newUserId) {
    update()
  } else {
    updateTimeout = clearTimeout(updateTimeout)
  }
})
