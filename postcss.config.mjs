const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    "@csstools/postcss-cascade-layers": {},
    "postcss-lightningcss": {
      browsers: "Chrome >= 80, Safari >= 14, ChromeAndroid >= 80, Firefox >= 90, iOS >= 14, Samsung >= 13",
    },
  },
};

export default config;
