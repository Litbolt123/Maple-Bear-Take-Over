export default [
    {
        files: ["BP/scripts/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                console: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
            },
        },
        rules: {
            "no-undef": "warn",
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
            "no-constant-condition": "warn",
            "no-debugger": "error",
            "no-dupe-args": "error",
            "no-dupe-keys": "error",
            "no-duplicate-case": "error",
            "no-unreachable": "warn",
            "eqeqeq": ["warn", "smart"],
            "no-eval": "error",
        },
    },
    {
        files: ["tools/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                console: "readonly",
                process: "readonly",
            },
        },
        rules: {
            "no-undef": "warn",
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
        },
    },
];
