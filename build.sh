#!/bin/bash
node -e "
const fs = require('fs');
const anonKey = (process.env.SUPABASE_ANON_KEY || '').replace(/\s/g, '');
const config = 'const CONFIG = {\n  kakao: {\n    jsKey: \"' + process.env.KAKAO_JS_KEY + '\",\n    restKey: \"' + process.env.KAKAO_REST_KEY + '\"\n  },\n  supabase: {\n    url: \"' + process.env.SUPABASE_URL + '\",\n    anonKey: \"' + anonKey + '\"\n  }\n};';
fs.writeFileSync('config.js', config);
"
