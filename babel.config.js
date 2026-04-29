module.exports = function (api) {
  api.cache(true);
  // Use expo's own bundled preset to guarantee version compatibility
  return {
    presets: [require.resolve('expo/node_modules/babel-preset-expo')],
  };
};
