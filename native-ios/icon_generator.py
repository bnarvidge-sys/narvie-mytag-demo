"""Deterministic opaque PNG app icons with a TAG label. Standard library only."""
from pathlib import Path
import struct,zlib

BG=(24,62,53)
FG=(227,237,188)
GLYPHS={'T':['11111','00100','00100','00100','00100','00100','00100'],
        'A':['01110','10001','10001','11111','10001','10001','10001'],
        'G':['01110','10001','10000','10111','10001','10001','01110']}
def foreground(x,y):
    arch=(x-256)**2+(y-187)**2
    if y<=187 and 47**2 <= arch <= 109**2: return True
    if 187<=y<=333 and (147<=x<=209 or 303<=x<=365): return True
    if (x-256)**2+(y-302)**2 <= 19**2: return True
    if 386<=y<421:
        col=int((x-213.5)//5);row=int((y-386)//5)
        if 0<=col<17:
            letter=col//6;pixel=col%6
            if letter<3 and pixel<5 and GLYPHS['TAG'[letter]][row][pixel]=='1':return True
    return False
def png(size):
    scale=512/size
    rows=[]
    for y in range(size):
        row=bytearray([0])
        for x in range(size):
            hits=sum(foreground((x+dx)*scale,(y+dy)*scale) for dx,dy in [(0.25,0.25),(0.75,0.25),(0.25,0.75),(0.75,0.75)])
            row.extend(round((FG[i]*hits+BG[i]*(4-hits))/4) for i in range(3))
        rows.append(bytes(row))
    def chunk(name,data):return struct.pack('!I',len(data))+name+data+struct.pack('!I',zlib.crc32(name+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows),9))+chunk(b'IEND',b'')
def generate(root):
    root=Path(root);root.mkdir(parents=True,exist_ok=True)
    for name,size in [('apple-touch-icon.png',180),('narvie-tags-192.png',192),('narvie-tags-512.png',512),('narvie-tags-maskable-512.png',512)]:
        (root/name).write_bytes(png(size))
if __name__=='__main__':generate(Path(__file__).resolve().parents[1]/'www/assets/icons')
