from PIL import Image
from bitstring import BitArray
import sys
im = Image.open(sys.argv[1])
pix = im.load()
w=im.size[0]
h=im.size[1]

s = BitArray(bytearray([w,h]));

bits = [ ]
for j in range(h):
  for i in range(w):
    if len(bits) == 8:
       s += bits 
       bits = [ ]
    if pix[i,j] == 1:
      bits.insert(0,0)
    else:
      bits.insert(0,1)
# pad row to 8 bits
  dif = 8 - len(bits) 
  for x in range(0, dif-1):
    bits.insert(0,0)

f = open('output.rgf', 'wb')
s.tofile(f)

print s.hex
