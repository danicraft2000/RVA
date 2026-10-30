// Blocópolis — salvar e carregar (navegador e arquivo)

const SAVE_KEY = 'blocopolis.save.v1';
const SAVE_VERSION = 1;

// Compressão simples por repetição: pares (quantidade, valor)
function rleEncode(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    const v = arr[i];
    let n = 1;
    while (i + n < arr.length && arr[i + n] === v && n < 255) n++;
    out.push(n, v);
    i += n;
  }
  return new Uint8Array(out);
}

function rleDecode(bytes, length) {
  const out = new Uint8Array(length);
  let o = 0;
  for (let i = 0; i + 1 < bytes.length && o < length; i += 2) {
    const n = bytes[i], v = bytes[i + 1];
    out.fill(v, o, Math.min(length, o + n));
    o += n;
  }
  return out;
}

function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function base64ToBytes(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const SaveStore = {
  has() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch (e) {
      return false;
    }
  },

  read() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  write(data) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  },

  download(data, name) {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (name || 'cidade').replace(/[^\w\-]+/g, '_') + '.blocopolis.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  },

  pickFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return reject(new Error('Nenhum arquivo'));
        const reader = new FileReader();
        reader.onload = () => {
          try {
            resolve(JSON.parse(reader.result));
          } catch (e) {
            reject(e);
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      };
      input.click();
    });
  },
};
