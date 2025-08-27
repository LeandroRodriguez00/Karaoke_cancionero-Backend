import fs from "fs";

// ruta absoluta (seguro funciona):
const buf = fs.readFileSync("C:/Users/leand/Desktop/cancionero-karaoke-stage1/server/data/karafuncatalog.csv");

// alternativamente, si ejecutás el script desde la carpeta `server/`:
 // const buf = fs.readFileSync("./data/karafuncatalog.csv");

console.log("Primeros 64 bytes:", buf.slice(0, 64).toString("hex"));
console.log("Como utf8 directo:", buf.slice(0, 200).toString("utf8"));
console.log("Como utf16le directo:", buf.slice(0, 200).toString("utf16le"));
