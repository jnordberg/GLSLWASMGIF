
module.exports = (env, callback) ->
  for pattern in env.config.static ? []
    env.registerContentPlugin 'static', pattern, env.plugins.StaticFile
  callback()
