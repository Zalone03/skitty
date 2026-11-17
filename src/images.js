// Reduz imagens antes de guardar (cabem no quadro e sincronizam rapido).

const MAX_SIDE = 1280;
const MAX_CHARS = 850_000; // ~ 630 KB

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("não consegui abrir essa imagem"));
    };
    img.src = url;
  });
}

export async function compressImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("o arquivo não é uma imagem");
  const img = await loadImage(file);
  let side = MAX_SIDE;
  for (let attempt = 0; attempt < 5; attempt++) {
    const scale = Math.min(1, side / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/webp", 0.82);
    const src = data.startsWith("data:image/webp") ? data : canvas.toDataURL("image/jpeg", 0.82);
    if (src.length <= MAX_CHARS) return src;
    side = Math.round(side * 0.75);
  }
  throw new Error("imagem grande demais");
}
