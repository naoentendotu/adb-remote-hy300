import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAdbConnection } from '@/hooks/useAdbConnection';
import { stripAccents } from '@/services/adb/AdbCommands';
import { describeError, toAdbError } from '@/services/adb/AdbErrors';
import { pushHistory } from '@/services/storage/SettingsStorage';
import { colors, radius } from '@/theme';

/** Keeps only what Android 9's `input text` can type: accents are dropped, anything else non-ASCII removed. */
const typeable = (s: string) => stripAccents(s).replace(/[^\x20-\x7e]/g, '');

/**
 * Live typing: the field mirrors the projector's text box. Each change is diffed against what was
 * already sent; extra characters go out with `input text`, removed ones as DEL presses. Every
 * `input text` costs ~1 s on the HY300, so keystrokes made meanwhile are batched into the next send.
 * shortcut: assumes the projector's cursor is at the end (edits mid-text are sent as delete + retype).
 */
export function TextInputPanel({ enabled }: { enabled: boolean }) {
  const { client, settings, updateSettings } = useAdbConnection();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const target = useRef('');
  const sent = useRef('');
  const pumping = useRef(false);

  const pump = async () => {
    if (pumping.current) return;
    pumping.current = true;
    setSyncing(true);
    try {
      while (sent.current !== target.current) {
        const want = target.current;
        let p = 0;
        while (p < sent.current.length && p < want.length && sent.current[p] === want[p]) p++;
        for (let i = sent.current.length; i > p; i--) {
          await client.pressKey('del');
          sent.current = sent.current.slice(0, -1);
        }
        const extra = want.slice(p);
        if (extra) {
          await client.sendText(extra, 'whole');
          sent.current = want;
        }
      }
      setStatus(null);
    } catch (e) {
      setStatus({ error: true, text: describeError(toAdbError(e)) });
      // Unknown state on the projector: stop mirroring until the user starts a new text.
      target.current = sent.current;
      setText(sent.current);
    } finally {
      pumping.current = false;
      setSyncing(false);
    }
  };

  const onChange = (value: string) => {
    const clean = typeable(value);
    setText(clean);
    if (!enabled) return;
    target.current = clean;
    void pump();
  };

  /** Forget what was typed locally without deleting it on the projector (e.g. after moving to another field). */
  const reset = () => {
    target.current = sent.current = '';
    setText('');
    setStatus(null);
  };

  const enter = async () => {
    if (text && settings.keepHistory) updateSettings({ history: pushHistory(settings.history, text) });
    try {
      await client.pressKey('enter');
      setStatus({ error: false, text: 'Enter enviado.' });
    } catch (e) {
      setStatus({ error: true, text: describeError(toAdbError(e)) });
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>Selecione o campo de busca no projetor e digite: o texto vai sendo enviado. Acentos são removidos.</Text>
      <TextInput
        value={text}
        onChangeText={onChange}
        editable={enabled}
        placeholder="Digite aqui"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        autoCorrect={false}
        autoCapitalize="none"
        blurOnSubmit={false}
        returnKeyType="search"
        onSubmitEditing={enter}
        accessibilityLabel="Texto enviado ao projetor enquanto você digita"
      />
      <Text style={[styles.feedback, status?.error && { color: colors.danger }]}>
        {syncing ? 'Enviando…' : (status?.text ?? (text ? 'Sincronizado com o projetor.' : ' '))}
      </Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          disabled={!enabled}
          onPress={enter}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed, !enabled && styles.disabled]}>
          <Text style={styles.primaryText}>Enter</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={reset} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <Text style={styles.secondaryText}>Novo texto</Text>
        </Pressable>
      </View>
      {settings.keepHistory && settings.history.length > 0 && (
        <View style={styles.history}>
          <View style={styles.historyHead}>
            <Text style={styles.section}>Recentes</Text>
            <Pressable accessibilityRole="button" onPress={() => updateSettings({ history: [] })}>
              <Text style={styles.link}>Apagar histórico</Text>
            </Pressable>
          </View>
          <View style={styles.chips}>
            {settings.history.map((h) => (
              <Pressable key={h} accessibilityRole="button" accessibilityLabel={`Digitar "${h}"`} disabled={!enabled} onPress={() => onChange(h)} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>{h}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
  },
  feedback: { color: colors.textMuted, fontSize: 13 },
  row: { flexDirection: 'row', gap: 8 },
  primary: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: colors.onPrimary, fontWeight: '700', fontSize: 15 },
  secondary: { paddingHorizontal: 20, borderRadius: radius.full, borderWidth: 1, borderColor: colors.outline, justifyContent: 'center' },
  secondaryText: { color: colors.text, fontWeight: '600' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
  history: { gap: 8, marginTop: 4 },
  historyHead: { flexDirection: 'row', justifyContent: 'space-between' },
  section: { color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  link: { color: colors.primary, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.outline, maxWidth: 200 },
  chipText: { color: colors.text, fontSize: 13 },
});
