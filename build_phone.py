#!/usr/bin/env python3
"""Build the /mytag/ PWA, static deploy tree, icons and installation QR."""
import argparse,json,shutil,subprocess,os
from pathlib import Path
from urllib.parse import urlsplit
from scripts.generate_icons import generate

ROOT=Path(__file__).resolve().parent
def build(public_url,skip_qr=False):
    parts=urlsplit(public_url)
    if parts.scheme!='https' or not parts.netloc or parts.path!='/mytag/' or parts.query or parts.fragment or parts.username:
        raise ValueError('Gebruik een HTTPS-URL zonder inloggegevens die eindigt op /mytag/.')
    if parts.hostname=='narvie4g.onrender.com':
        raise ValueError('Gebruik een afzonderlijke MyTag-host; het bestaande 4G-domein is beschermd.')
    generate(ROOT/'www/assets/icons')
    installation_url=public_url+'installeren.html'
    if not skip_qr:
        node=shutil.which('node') or os.environ.get('CODEX_PRIMARY_RUNTIME_NODE')
        bundled=Path('/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node')
        if not node and bundled.exists():node=str(bundled)
        if not node:raise RuntimeError('Node ontbreekt voor QR-generatie. Gebruik --skip-qr alleen bij dezelfde publicatie-URL.')
        subprocess.run([node,str(ROOT/'scripts/render_qr.cjs'),installation_url,str(ROOT/'www/assets/install-qr.png')],check=True)
    if not (ROOT/'www/assets/install-qr.png').exists():raise RuntimeError('Installatie-QR ontbreekt.')
    qr_metadata=ROOT/'www/assets/install-qr-url.txt'
    if skip_qr and (not qr_metadata.exists() or qr_metadata.read_text().strip()!=installation_url):
        raise RuntimeError('Bestaande QR hoort niet bij deze URL; genereer hem opnieuw.')
    qr_metadata.write_text(installation_url+'\n')
    dist=ROOT/'site/dist'
    target=dist/'mytag'
    if target.exists():shutil.rmtree(target)
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copytree(ROOT/'www',target)
    (dist/'index.html').write_text('<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/mytag/installeren.html"><title>Narvie Trackers</title></head><body><a href="/mytag/installeren.html">Open de Narvie Trackers-installatiepagina</a></body></html>')
    (dist/'_headers').write_text('''/mytag/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://narvie-mytag-test.onrender.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'
/mytag/sw.js
  Cache-Control: no-cache
/mytag/manifest.webmanifest
  Cache-Control: no-cache
/mytag/*.html
  Cache-Control: no-cache
''')
    shutil.copytree(ROOT/'server',dist/'server',dirs_exist_ok=True)
    (dist/'package.json').write_text(json.dumps({'name':'narvie-mytag-test-server','version':'0.3.4','private':True,'type':'module','engines':{'node':'>=22'},'scripts':{'start':'node server/app.mjs','test':'node --test'}})+'\n')
    print('PWA gebouwd onder site/dist/mytag/.')
    print('QR-doel (geen bewijs van publicatie): '+installation_url)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--public-url',default=json.loads((ROOT/'publication.json').read_text()).get('live_base_url',json.loads((ROOT/'publication.json').read_text()).get('expected_base_url')))
    parser.add_argument('--skip-qr',action='store_true')
    args=parser.parse_args();build(args.public_url,args.skip_qr)
