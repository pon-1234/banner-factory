module.exports = {
  root: true,
  extends: ["next", "next/core-web-vitals", "eslint:recommended"],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.json"]
  }
};
