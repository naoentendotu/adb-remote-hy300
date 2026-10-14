# Remote ADB Controller (HY300)

App Android (Expo + React Native) que controla o projetor HY300 pela rede local via ADB sobre TCP.

## Estrutura

- `src/app` — telas (expo-router): Conexão, Controle (Direcional / Touchpad / Teclado) e Diagnóstico, com modo demonstração.
- `src/services/adb` — máquina de estados, fila serial, reconexão, heartbeat, construção segura de comandos e transporte simulado.
- `modules/adb-bridge` — módulo nativo Kotlin sobre o [dadb](https://github.com/mobile-dev-inc/dadb) (Apache-2.0). A chave ADB é gerada no módulo e guardada cifrada com AES-GCM do Android Keystore.
- `tests` — testes Jest (validação, comandos e cliente com transporte simulado).

## Comandos

```sh
npm install
npm test
npx tsc --noEmit
npx expo lint
npx expo run:android --device   # precisa de build nativo (módulo adb-bridge)
```

## Decisões

- **Teclas por evdev em vez de `input keyevent`:** `input keyevent` leva ~1,2 s por tecla no HY300 (sobe uma JVM a cada chamada). Escrever `struct input_event` em `/dev/input/event0` (receptor IR) leva ~10–40 ms. Sem o nó IR gravável, tudo cai para `input keyevent`.
- **Mudo:** `KEYCODE_VOLUME_MUTE` (164); `KEYCODE_MUTE` (91) é o mudo do microfone.
- **Texto e toque:** `input text/tap/swipe` (~1,2 s por chamada). Texto aceita só ASCII imprimível; o arrasto é enviado como um único swipe ao soltar o dedo.

## Segurança

O HY300 vem com `ro.adb.secure=0`: entrega shell root a qualquer aparelho da mesma rede Wi-Fi. O app só aceita endereços de rede local (10.x, 172.16–31.x, 192.168.x). Não exponha a porta 5555 à internet.

## Pendências conhecidas

- Módulo Kotlin e APK ainda não compilados/testados em aparelho.
- Lint: `react-hooks/refs` em `src/components/VirtualTouchpad.tsx` (PanResponder dentro de `useMemo` lê refs).
- Cancelar durante a negociação: a thread nativa só termina no timeout (20 s).
