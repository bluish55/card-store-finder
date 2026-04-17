#!/bin/bash
cat > config.js << EOF
const CONFIG = {
  kakao: {
    jsKey: '${KAKAO_JS_KEY}',
    restKey: '${KAKAO_REST_KEY}'
  },
  supabase: {
    url: '${SUPABASE_URL}',
    anonKey: '${SUPABASE_ANON_KEY}'
  }
};
EOF
