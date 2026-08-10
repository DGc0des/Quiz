module.exports = function (api) {
  api.cache(true);
  // Standard Expo preset — resolved from wherever npm hoists babel-preset-expo.
  // (Don't hardcode a nested expo/node_modules path; it breaks when the package
  // is hoisted to the top level, e.g. after an SDK change.)
  return {
    presets: ['babel-preset-expo'],
  };
};
