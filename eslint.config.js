import xo from "eslint-config-xo";
import typescriptEslintParser from "@typescript-eslint/parser";
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import {defineConfig} from 'eslint/config';

export default defineConfig(
    eslint.configs.recommended,
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    ...xo(),
    {
        languageOptions: {
            parser: typescriptEslintParser,
        },
        rules: {
            "@stylistic/function-paren-newline": ["off"],
            "@stylistic/indent": ["error", 4],
            "@stylistic/indent-binary-ops": ["error", 4],
            "@stylistic/max-len": ["off"],
            "@stylistic/multiline-ternary": ["off"],
            "@stylistic/operator-linebreak": ["off"],
            "@typescript-eslint/no-misused-promises": ["error", {
                checksVoidReturn: false
            }],
            "@typescript-eslint/no-unsafe-assignment": ["off"],
            "@typescript-eslint/no-unsafe-call": ["off"],
            "@typescript-eslint/no-unsafe-enum-comparison": ["off"],
            "@typescript-eslint/consistent-type-definitions": ["error",
                "type"
            ],
            "@typescript-eslint/array-type": ["error", {
                default: "array-simple"
            }],
            "@typescript-eslint/naming-convention": ["error",
                {
                    "selector": "variableLike",
                    "format": ["camelCase"]
                },
                {
                    "selector": "variableLike",
                    "format": null,
                    "modifiers": ["unused"]
                },
                {
                    "format": ["camelCase", "UPPER_CASE"],
                    "selector": "variable",
                    "modifiers": ["const"]
                },
                {
                    "format": ["PascalCase"],
                    "selector": "variable",
                    "modifiers": ["const"],
                    "filter": "Validation$"
                }
            ],
            "@typescript-eslint/prefer-promise-reject-errors": "off",
            "@typescript-eslint/promise-function-async": "off",
            "@typescript-eslint/strict-boolean-expressions": ["error",
                {
                    "allowString": false,
                    "allowNumber": false,
                    "allowNullableObject": false
                }
            ],
            "@typescript-eslint/triple-slash-reference": "off",
            "@typescript-eslint/no-shadow": "off",
            "@typescript-eslint/switch-exhaustiveness-check": "off",
            "capitalized-comments": "off",
            "@stylistic/object-curly-newline": ["error", {
                "ImportDeclaration": "never"
            }],
            "n/file-extension-in-import": "off",
            "promise-function-async": "off",
            "camelcase": "off",
            "default-case": "off",
            "import/extensions": "off",
            "import-x/extensions": "off",
            "import/no-unassigned-import": "off",
            "no-dupe-class-members": "off",
            "no-negated-condition": "off",
            "no-redeclare": "off",
            "no-unused-vars": "off",
            "no-useless-constructor": "off",
            "no-void": ["error", {
                allowAsStatement: true
            }],
            "no-warning-comments": "off",
            "prefer-promise-reject-errors": "off",
            "unicorn/consistent-boolean-name": "off",
            "unicorn/consistent-compound-words": "off",
            "unicorn/consistent-function-scoping": "off",
            "unicorn/explicit-length-check": "off",
            "unicorn/filename-case": "off",
            "unicorn/name-replacements": "off",
            "unicorn/no-break-in-nested-loop": "off",
            "unicorn/no-negated-condition": "off",
            "unicorn/no-useless-undefined": ["error", {
                checkArguments: false
            }],
            "unicorn/prefer-top-level-await": "off",
            "unicorn/switch-case-braces": "off",
            "unicorn/prevent-abbreviations": "off",
        }
    }
);
