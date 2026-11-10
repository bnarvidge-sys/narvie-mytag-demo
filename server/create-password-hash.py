#!/usr/bin/env python3
"""User-run helper: password hidden; print only its server-side scrypt hash."""
import getpass,hashlib,secrets
password=getpass.getpass('Kies je persoonlijke Narvie-testwachtwoord (minimaal 12 tekens): ')
if len(password)<12 or len(password)>256:raise SystemExit('Gebruik 12 tot 256 tekens.')
if password!=getpass.getpass('Herhaal het wachtwoord: '):raise SystemExit('De wachtwoorden verschillen.')
salt=secrets.token_bytes(16)
digest=hashlib.scrypt(password.encode('utf-8'),salt=salt,n=16384,r=8,p=1,dklen=64)
print('NARVIE_OWNER_PASSWORD_HASH=scrypt:'+salt.hex()+':'+digest.hex())
