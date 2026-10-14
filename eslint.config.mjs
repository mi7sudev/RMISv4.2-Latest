import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    
    // React rules
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react-hooks/set-state-in-effect": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",
    
    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",
    
    // General JavaScript rules
    "prefer-const": "off",
    "no-unused-vars": "off",
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "off",
    "no-useless-escape": "off",
  },
}, {
  // BEUI registry blocks (src/components/motion/**) are vendored verbatim from
  // beui.dev — their official source ships empty prop interfaces, so relax the
  // style rule for that folder instead of modifying upstream code.
  files: ["src/components/motion/**/*.tsx", "src/components/motion/**/*.ts"],
  rules: {
    "@typescript-eslint/no-empty-object-type": "off",
    // The official Table block (beui.dev/r/table) is built on TanStack
    // Virtual; React Compiler flags that API as an incompatible library.
    // Upstream ships it this way — silence the advisory for vendored code
    // instead of modifying the official source.
    "react-hooks/incompatible-library": "off",
    // The official popover-morph block (beui.dev, phase 6 date-range-picker
    // closure) passes context refs (contentRef) to portal children — a
    // pattern React Compiler's refs rule flags. Official code stays verbatim.
    "react-hooks/refs": "off",
    // The official date-range-picker block mutates context ref holders
    // (content/trigger/current) — upstream ships it this way; vendored
    // code stays verbatim.
    "react-hooks/immutability": "off",
    // The official FileUpload block (beui.dev/r/file-upload) renders row
    // icons via a local getFileIcon factory invoked during render —
    // upstream ships it this way; vendored code stays verbatim.
    "react-hooks/static-components": "off",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "deploy/**", "scripts/**"]
}];

export default eslintConfig;
