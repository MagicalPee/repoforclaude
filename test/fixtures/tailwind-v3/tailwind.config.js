// If this file were executed, the next line would create a marker file. The inspector must only parse it.
require("fs").writeFileSync(require("path").join(__dirname, "EXECUTED.marker"), "executed");
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        brand: { DEFAULT: "#7c2d12", light: "#fed7aa" },
      },
      fontFamily: { display: ["Bricolage Grotesque", "sans-serif"] },
      borderRadius: { card: "18px" },
    },
  },
};
