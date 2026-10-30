// Web has no raw TCP: this stub only lets the UI open in a browser for previews (use "Modo demonstração").
const unavailable = () => Promise.reject(Object.assign(new Error('ADB não está disponível na versão web.'), { code: 'ERR_UNREACHABLE' }));

export default {
  probe: unavailable,
  connect: unavailable,
  exec: unavailable,
  disconnect: () => Promise.resolve(),
  resetKey: unavailable,
};
