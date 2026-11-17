#!/usr/bin/env bash
set -euo pipefail
mkdir -p public/images
cp site/index.html public/index.html
# Migrate only the three already-approved public images; verify file type, never publish a truncated download.
for asset in founder.jpg windows.jpg cleanout.png; do
  if curl --fail --silent --show-error --location --max-time 30 "https://curb-common-preview.vercel.app/images/$asset" -o "public/images/$asset"; then
    if ! file -b "public/images/$asset" | grep -Eq 'JPEG image data|PNG image data'; then rm -f "public/images/$asset"; fi
  else rm -f "public/images/$asset"; fi
done
# Fail gracefully to a branded illustration rather than broken photos.
node --input-type=module <<'JS'
import fs from 'node:fs';
let h=fs.readFileSync('public/index.html','utf8');
const map={'founder.jpg':'South Bay property care','windows.jpg':'Ground-level glass','cleanout.png':'Turnover by request'};
for(const [name,label] of Object.entries(map)){
 if(!fs.existsSync('public/images/'+name)){
  const re=new RegExp('<img src="/images/'+name.replace('.','\\.')+'"[^>]*>','g');
  h=h.replace(re,'<div class="fallback-art"><div><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 30 32 9 56 30v25H39V39H25v16H8Z"/></svg>'+label+'</div></div>');
 }
}
fs.writeFileSync('public/index.html',h);
JS
