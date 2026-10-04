/** Read dimensions before invoking an image decoder. Animated WebP is download-only. */
export function safeRaster(bytes:Buffer):boolean{
 let width=0,height=0;
 if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR'){
  width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);
 }else if(bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){
  const type=bytes.toString('ascii',12,16);
  if(type==='VP8X'&&!(bytes[20]&2)){width=1+bytes.readUIntLE(24,3);height=1+bytes.readUIntLE(27,3);}
  else if(type==='VP8L'&&bytes[20]===47){const bits=bytes.readUInt32LE(21);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;}
  else if(type==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=bytes.readUInt16LE(26)&16383;height=bytes.readUInt16LE(28)&16383;}
 }else if(bytes[0]===255&&bytes[1]===216){
  let offset=2;
  while(offset+4<bytes.length){
   if(bytes[offset++]!==255)return false;while(bytes[offset]===255)offset++;
   const marker=bytes[offset++];if(marker===217||marker===218)break;
   if(marker===1||marker>=208&&marker<=215)continue;
   if(offset+2>bytes.length)return false;const length=bytes.readUInt16BE(offset);
   if(length<2||offset+length>bytes.length)return false;
   if([192,193,194].includes(marker)&&length>=8){height=bytes.readUInt16BE(offset+3);width=bytes.readUInt16BE(offset+5);break;}
   offset+=length;
  }
 }
 return width>0&&height>0&&width<=8192&&height<=8192&&width*height<=20_000_000;
}
